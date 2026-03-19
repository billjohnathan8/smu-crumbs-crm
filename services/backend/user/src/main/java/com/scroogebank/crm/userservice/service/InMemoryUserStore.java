package com.scroogebank.crm.userservice.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.scroogebank.crm.userservice.dto.CreateUserRequest;
import com.scroogebank.crm.userservice.dto.UpdateUserRequest;
import com.scroogebank.crm.userservice.dto.UserDto;
import com.scroogebank.crm.userservice.dto.UserRole;
import com.scroogebank.crm.userservice.dto.UserStatus;
import com.scroogebank.crm.userservice.exception.AccessDeniedException;
import com.scroogebank.crm.userservice.exception.DuplicateUserException;
import com.scroogebank.crm.userservice.exception.UserNotFoundException;
import com.scroogebank.crm.userservice.util.IdCodec;

/**
 * In-memory user store used for CRUD operations and refresh token tracking.
 *
 * <p>This store is process-local and not shared across replicas. User mutations and refresh tokens are
 * lost on task restart and are invisible to other tasks. When this store is selected, keep the service
 * single-replica in production.
 */
@Component
@ConditionalOnProperty(name = "app.user-store.type", havingValue = "in-memory")
public class InMemoryUserStore implements UserStore {
	private static final String USER_ID_PREFIX = "usr_";
	private static final long ROOT_ADMIN_DB_ID = 1L;
	private static final Duration REFRESH_TTL = Duration.ofDays(7);

	private final Clock clock;
	private final PasswordHasher passwordHasher;
	private final AtomicLong idSequence = new AtomicLong(2L);
	private final Map<Long, UserRecord> users = new ConcurrentHashMap<>();
	private final Map<String, Long> emailIndex = new ConcurrentHashMap<>();
	private final Map<String, RefreshTokenRecord> refreshTokens = new ConcurrentHashMap<>();
	private final Map<String, PasswordResetTokenRecord> passwordResetTokens = new ConcurrentHashMap<>();
	private final Map<String, String> latestResetTokenByEmail = new ConcurrentHashMap<>();

	public InMemoryUserStore(
		Clock clock,
		PasswordHasher passwordHasher,
		@Value("${app.root-admin.email}") String rootEmail,
		@Value("${app.root-admin.password}") String rootPassword
	) {
		this.clock = clock;
		this.passwordHasher = passwordHasher;
		seedRootAdmin(rootEmail, rootPassword);
	}

	/**
	 * Creates a new user and returns its DTO representation.
	 *
	 * @param request create user payload
	 * @return created user DTO
	 * @throws DuplicateUserException when the email already exists
	 */
	@Override
	public UserDto createUser(CreateUserRequest request) {
		String email = normalizeEmail(request.email());
		if (emailIndex.containsKey(email)) {
			throw new DuplicateUserException("Email already exists.");
		}

		long id = idSequence.getAndIncrement();
		Instant now = clock.instant();
		String password = (request.temporaryPassword() == null || request.temporaryPassword().isBlank())
			? UUID.randomUUID().toString()
			: request.temporaryPassword();
		UserRole role = Objects.requireNonNullElse(request.role(), UserRole.user);

		UserRecord record = new UserRecord(
			id,
			request.firstName(),
			request.lastName(),
			email,
			role,
			UserStatus.active,
			passwordHasher.hash(password),
			now,
			now
		);
		users.put(id, record);
		emailIndex.put(email, id);
		return toDto(record);
	}

	/**
	 * Applies a partial update to an existing user.
	 *
	 * @param userId API user identifier
	 * @param patch update payload
	 * @return updated user DTO
	 * @throws DuplicateUserException when the updated email already exists
	 */
	@Override
	public UserDto updateUser(String userId, UpdateUserRequest patch) {
		long dbId = decodeUserId(userId);
		UserRecord existing = loadByDbId(dbId);

		String newEmail = patch.email() == null ? existing.email() : normalizeEmail(patch.email());
		Long emailOwner = emailIndex.get(newEmail);
		if (emailOwner != null && emailOwner != dbId) {
			throw new DuplicateUserException("Email already exists.");
		}

		Instant now = clock.instant();
		UserRecord updated = new UserRecord(
			dbId,
			patch.firstName() == null ? existing.firstName() : patch.firstName(),
			patch.lastName() == null ? existing.lastName() : patch.lastName(),
			newEmail,
			patch.role() == null ? existing.role() : patch.role(),
			existing.status(),
			existing.passwordHash(),
			existing.createdAt(),
			now
		);

		users.put(dbId, updated);
		if (!existing.email().equals(newEmail)) {
			emailIndex.remove(existing.email());
			emailIndex.put(newEmail, dbId);
		}
		return toDto(updated);
	}

	/**
	 * Deletes a user and removes any associated refresh tokens.
	 *
	 * @param userId API user identifier
	 * @throws AccessDenied when attempting to delete the root admin
	 */
	@Override
	public void deleteUser(String userId) {
		long dbId = decodeUserId(userId);
		if (dbId == ROOT_ADMIN_DB_ID) {
			throw new AccessDeniedException("root_admin");
		}
		UserRecord existing = loadByDbId(dbId);
		Instant now = clock.instant();
		UserRecord updated = new UserRecord(
			dbId,
			existing.firstName(),
			existing.lastName(),
			existing.email(),
			existing.role(),
			UserStatus.deleted,
			existing.passwordHash(),
			existing.createdAt(),
			now
		);
		users.put(dbId, updated);
		emailIndex.remove(existing.email());
		refreshTokens.entrySet().removeIf(e -> e.getValue().dbUserId == dbId);
	}

	/**
	 * Marks a user as disabled.
	 *
	 * @param userId API user identifier
	 * @return updated user DTO
	 */
	@Override
	public UserDto disableUser(String userId) {
		long dbId = decodeUserId(userId);
		UserRecord existing = loadByDbId(dbId);
		Instant now = clock.instant();
		UserRecord updated = new UserRecord(
			dbId,
			existing.firstName(),
			existing.lastName(),
			existing.email(),
			existing.role(),
			UserStatus.disabled,
			existing.passwordHash(),
			existing.createdAt(),
			now
		);
		users.put(dbId, updated);
		return toDto(updated);
	}

	/**
	 * Resets a user's password and invalidates refresh tokens.
	 *
	 * @param userId API user identifier
	 */
	@Override
	public void resetPassword(String userId) {
		long dbId = decodeUserId(userId);
		UserRecord existing = loadByDbId(dbId);
		Instant now = clock.instant();
		String newPassword = UUID.randomUUID().toString();
		UserRecord updated = new UserRecord(
			dbId,
			existing.firstName(),
			existing.lastName(),
			existing.email(),
			existing.role(),
			existing.status(),
			passwordHasher.hash(newPassword),
			existing.createdAt(),
			now
		);
		users.put(dbId, updated);
		refreshTokens.entrySet().removeIf(e -> e.getValue().dbUserId == dbId);
	}

	/**
	 * Retrieves a user by identifier.
	 *
	 * @param userId API user identifier
	 * @return user DTO
	 */
	@Override
	public UserDto getUser(String userId) {
		long dbId = decodeUserId(userId);
		return toDto(loadByDbId(dbId));
	}

	/**
	 * Finds a user record by email address.
	 *
	 * @param email email address
	 * @return user record or null
	 */
	@Override
	public UserRecord findByEmail(String email) {
		Long dbId = emailIndex.get(normalizeEmail(email));
		return dbId == null ? null : users.get(dbId);
	}

	/**
	 * Loads a user record by API user identifier.
	 *
	 * @param userId API user identifier
	 * @return user record
	 */
	@Override
	public UserRecord loadRecord(String userId) {
		long dbId = decodeUserId(userId);
		return loadByDbId(dbId);
	}

	/**
	 * Lists users with pagination and optional role filtering.
	 *
	 * @param limit requested page size
	 * @param offset requested offset
	 * @param roleFilter optional role filter
	 * @return list of user DTOs
	 */
	@Override
	public List<UserDto> listUsers(int limit, int offset, String roleFilter) {
		String normalizedRole = roleFilter == null ? null : roleFilter.trim();
		List<UserRecord> records = new ArrayList<>(users.values());
		records.sort(Comparator.comparingLong(u -> u.id));
		if (normalizedRole != null && !normalizedRole.isBlank()) {
			UserRole role = UserRole.fromWireValue(normalizedRole);
			records = records.stream().filter(u -> u.role == role).toList();
		}

		int normalizedLimit = Math.max(1, Math.min(200, limit));
		int normalizedOffset = Math.max(0, offset);
		int fromIndex = Math.min(normalizedOffset, records.size());
		int toIndex = Math.min(fromIndex + normalizedLimit, records.size());
		return records.subList(fromIndex, toIndex).stream().map(InMemoryUserStore::toDto).toList();
	}

	/**
	 * Counts the number of users matching the optional role filter.
	 *
	 * @param roleFilter optional role filter
	 * @return count of matching users
	 */
	@Override
	public long countUsers(String roleFilter) {
		String normalizedRole = roleFilter == null ? null : roleFilter.trim();
		if (normalizedRole == null || normalizedRole.isBlank()) {
			return users.size();
		}
		UserRole role = UserRole.fromWireValue(normalizedRole);
		return users.values().stream().filter(u -> u.role == role).count();
	}

	/**
	 * Issues a refresh token for a user.
	 *
	 * @param userId API user identifier
	 * @return refresh token
	 */
	@Override
	public String issueRefreshToken(String userId) {
		long dbId = decodeUserId(userId);
		loadByDbId(dbId);
		String token = UUID.randomUUID().toString();
		refreshTokens.put(token, new RefreshTokenRecord(dbId, clock.instant().plus(REFRESH_TTL)));
		return token;
	}

	/**
	 * Rotates a refresh token if it is still valid.
	 *
	 * @param oldToken existing refresh token
	 * @return new refresh token, or null if invalid/expired
	 */
	@Override
	public String rotateRefreshToken(String oldToken) {
		RefreshTokenRecord record = refreshTokens.remove(oldToken);
		if (record == null) {
			return null;
		}
		if (clock.instant().isAfter(record.expiresAt)) {
			return null;
		}
		String token = UUID.randomUUID().toString();
		refreshTokens.put(token, new RefreshTokenRecord(record.dbUserId, clock.instant().plus(REFRESH_TTL)));
		return token;
	}

	/**
	 * Validates a refresh token without rotating it.
	 *
	 * @param token refresh token
	 * @return true if valid and not expired
	 */
	@Override
	public boolean isRefreshTokenValid(String token) {
		RefreshTokenRecord record = refreshTokens.get(token);
		return record != null && clock.instant().isBefore(record.expiresAt);
	}

	/**
	 * Resolves a refresh token to an API user id.
	 *
	 * @param token refresh token
	 * @return user id or null when invalid/expired
	 */
	@Override
	public String userIdForRefreshToken(String token) {
		RefreshTokenRecord record = refreshTokens.get(token);
		if (record == null || clock.instant().isAfter(record.expiresAt)) {
			return null;
		}
		return encodeUserId(record.dbUserId);
	}

	/**
	 * Verifies a plaintext password against the stored hash.
	 *
	 * @param record user record
	 * @param password plaintext password
	 * @return true when the password matches
	 */
	@Override
	public boolean verifyPassword(UserRecord record, String password) {
		return passwordHasher.verify(password, record.passwordHash());
	}

	private void seedRootAdmin(String email, String password) {
		Instant now = clock.instant();
		String normalizedEmail = normalizeEmail(email);
		UserRecord root = new UserRecord(
			ROOT_ADMIN_DB_ID,
			"Root",
			"Admin",
			normalizedEmail,
			UserRole.admin,
			UserStatus.active,
			passwordHasher.hash(password),
			now,
			now
		);
		users.put(ROOT_ADMIN_DB_ID, root);
		emailIndex.put(normalizedEmail, ROOT_ADMIN_DB_ID);
	}

	private UserRecord loadByDbId(long dbId) {
		UserRecord record = users.get(dbId);
		if (record == null) {
			throw new UserNotFoundException(encodeUserId(dbId));
		}
		return record;
	}

	private static long decodeUserId(String userId) {
		return IdCodec.decode(USER_ID_PREFIX, userId);
	}

	private static String encodeUserId(long dbId) {
		return IdCodec.encode(USER_ID_PREFIX, dbId);
	}

	private static String normalizeEmail(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}

	private static UserDto toDto(UserRecord record) {
		return new UserDto(
			encodeUserId(record.id()),
			record.firstName(),
			record.lastName(),
			record.email(),
			record.role(),
			record.status(),
			record.createdAt(),
			record.updatedAt()
		);
	}

	/**
	 * Internal persistent user representation.
	 */
	public record UserRecord(
		long id,
		String firstName,
		String lastName,
		String email,
		UserRole role,
		UserStatus status,
		String passwordHash,
		Instant createdAt,
		Instant updatedAt
	) {}

	/**
	 * Creates a password reset token for the given email.
	 *
	 * @param email user email address
	 * @return reset token, or null if no user with that email exists
	 */
	@Override
	public String createPasswordResetToken(String email) {
		String normalized = normalizeEmail(email);
		Long dbId = emailIndex.get(normalized);
		if (dbId == null) {
			return null;
		}
		String token = UUID.randomUUID().toString();
		passwordResetTokens.put(token, new PasswordResetTokenRecord(dbId, clock.instant().plus(Duration.ofHours(1))));
		latestResetTokenByEmail.put(normalized, token);
		return token;
	}

	/**
	 * Returns the most recently created reset token for the given email (test-only).
	 *
	 * @param email user email address
	 * @return latest reset token, or null
	 */
	@Override
	public String getLatestResetToken(String email) {
		return latestResetTokenByEmail.get(normalizeEmail(email));
	}

	/**
	 * Resets a user's password using a valid reset token.
	 *
	 * @param token reset token
	 * @param newPassword new plaintext password
	 * @throws IllegalArgumentException when the token is invalid or expired
	 */
	@Override
	public void resetPasswordWithToken(String token, String newPassword) {
		PasswordResetTokenRecord record = passwordResetTokens.remove(token);
		if (record == null || clock.instant().isAfter(record.expiresAt)) {
			throw new IllegalArgumentException("invalid_or_expired_token");
		}
		UserRecord existing = loadByDbId(record.dbUserId);
		Instant now = clock.instant();
		UserRecord updated = new UserRecord(
			existing.id(),
			existing.firstName(),
			existing.lastName(),
			existing.email(),
			existing.role(),
			existing.status(),
			passwordHasher.hash(newPassword),
			existing.createdAt(),
			now
		);
		users.put(existing.id(), updated);
		refreshTokens.entrySet().removeIf(e -> e.getValue().dbUserId == existing.id());
	}

	/**
	 * Refresh token metadata for the in-memory store.
	 */
	private record RefreshTokenRecord(
		long dbUserId,
		Instant expiresAt
	) {}

	/**
	 * Password reset token metadata.
	 */
	private record PasswordResetTokenRecord(
		long dbUserId,
		Instant expiresAt
	) {}
}
