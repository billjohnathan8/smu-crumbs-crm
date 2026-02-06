package com.itsa.crm.transactions_service.service;

import com.itsa.crm.transactions_service.dto.CreateUserRequest;
import com.itsa.crm.transactions_service.dto.UpdateUserRequest;
import com.itsa.crm.transactions_service.dto.UserDto;
import com.itsa.crm.transactions_service.dto.UserRole;
import com.itsa.crm.transactions_service.dto.UserStatus;
import com.itsa.crm.transactions_service.exception.DuplicateUserException;
import com.itsa.crm.transactions_service.exception.UserNotFoundException;
import com.itsa.crm.transactions_service.security.ForbiddenException;
import com.itsa.crm.transactions_service.util.IdCodec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * In-memory user store handling CRUD, roles, and refresh tokens.
 */
public class InMemoryUserStore {
	private static final String USER_ID_PREFIX = "usr_";
	private static final long ROOT_ADMIN_DB_ID = 1L;
	private static final Duration REFRESH_TTL = Duration.ofDays(7);

	private final Clock clock;
	private final PasswordHasher passwordHasher;
	private final AtomicLong idSequence = new AtomicLong(2L);
	private final Map<Long, UserRecord> users = new ConcurrentHashMap<>();
	private final Map<String, Long> emailIndex = new ConcurrentHashMap<>();
	private final Map<String, RefreshTokenRecord> refreshTokens = new ConcurrentHashMap<>();

	public InMemoryUserStore(
		Clock clock,
		PasswordHasher passwordHasher,
		String rootEmail,
		String rootPassword
	) {
		this.clock = clock;
		this.passwordHasher = passwordHasher;
		seedRootAdmin(rootEmail, rootPassword);
	}

	/**
	 * Creates a new user and returns its DTO representation.
	 */
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
		UserRole role = request.role() == null ? UserRole.agent : request.role();

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
	 * Updates a user with partial fields, enforcing unique email constraints.
	 */
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
	 * Deletes a user and associated refresh tokens (except the root admin).
	 */
	public void deleteUser(String userId) {
		long dbId = decodeUserId(userId);
		if (dbId == ROOT_ADMIN_DB_ID) {
			throw new ForbiddenException("root_admin");
		}
		UserRecord existing = loadByDbId(dbId);
		users.remove(dbId);
		emailIndex.remove(existing.email());
		refreshTokens.entrySet().removeIf(e -> e.getValue().dbUserId == dbId);
	}

	/**
	 * Disables a user account without deleting the record.
	 */
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
	 * Resets a user's password and revokes all refresh tokens.
	 */
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
	 * Retrieves a user by id.
	 */
	public UserDto getUser(String userId) {
		long dbId = decodeUserId(userId);
		return toDto(loadByDbId(dbId));
	}

	/**
	 * Finds a user record by normalized email, or null if missing.
	 */
	public UserRecord findByEmail(String email) {
		Long dbId = emailIndex.get(normalizeEmail(email));
		return dbId == null ? null : users.get(dbId);
	}

	/**
	 * Loads the internal user record by id or throws if missing.
	 */
	public UserRecord loadRecord(String userId) {
		long dbId = decodeUserId(userId);
		return loadByDbId(dbId);
	}

	/**
	 * Lists users with optional role filtering and pagination.
	 */
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
	 * Counts users, optionally filtered by role.
	 */
	public long countUsers(String roleFilter) {
		String normalizedRole = roleFilter == null ? null : roleFilter.trim();
		if (normalizedRole == null || normalizedRole.isBlank()) {
			return users.size();
		}
		UserRole role = UserRole.fromWireValue(normalizedRole);
		return users.values().stream().filter(u -> u.role == role).count();
	}

	/**
	 * Issues a new refresh token for a user id.
	 */
	public String issueRefreshToken(String userId) {
		long dbId = decodeUserId(userId);
		loadByDbId(dbId);
		String token = UUID.randomUUID().toString();
		refreshTokens.put(token, new RefreshTokenRecord(dbId, clock.instant().plus(REFRESH_TTL)));
		return token;
	}

	/**
	 * Rotates an existing refresh token if valid and unexpired.
	 */
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
	 * Checks whether a refresh token exists and is unexpired.
	 */
	public boolean isRefreshTokenValid(String token) {
		RefreshTokenRecord record = refreshTokens.get(token);
		return record != null && clock.instant().isBefore(record.expiresAt);
	}

	/**
	 * Returns the encoded user id for a valid refresh token.
	 */
	public String userIdForRefreshToken(String token) {
		RefreshTokenRecord record = refreshTokens.get(token);
		if (record == null || clock.instant().isAfter(record.expiresAt)) {
			return null;
		}
		return encodeUserId(record.dbUserId);
	}

	/**
	 * Verifies a cleartext password against the stored hash.
	 */
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

	private record RefreshTokenRecord(
		long dbUserId,
		Instant expiresAt
	) {}
}

