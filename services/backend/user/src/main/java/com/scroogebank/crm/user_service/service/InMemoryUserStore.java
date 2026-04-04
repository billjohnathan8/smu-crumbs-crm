package com.scroogebank.crm.user_service.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import com.scroogebank.crm.user_service.dto.CreateUserRequest;
import com.scroogebank.crm.user_service.dto.UpdateUserRequest;
import com.scroogebank.crm.user_service.dto.UserDto;
import com.scroogebank.crm.user_service.dto.UserRole;
import com.scroogebank.crm.user_service.dto.UserStatus;
import com.scroogebank.crm.user_service.exception.AccessDeniedException;
import com.scroogebank.crm.user_service.exception.DuplicateUserException;
import com.scroogebank.crm.user_service.exception.UserNotFoundException;
import com.scroogebank.crm.user_service.util.IdCodec;

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
	private static final String DEFAULT_SEED_AGENT_FIRST_NAME = "Agent";
	private static final String DEFAULT_SEED_AGENT_LAST_NAME = "One";
	private static final String DEFAULT_SEED_AGENT_EMAIL = "agent1@crm.com";
	private static final String DEFAULT_SEED_AGENT_PASSWORD = "V7!mQ2#pL9@xR4$k";
	private static final Duration REFRESH_TTL = Duration.ofDays(7);
	private static final Duration RESET_TTL = Duration.ofHours(1);
	private static final HexFormat HEX_FORMAT = HexFormat.of();

	private final Clock clock;
	private final PasswordHasher passwordHasher;
	private final boolean testResetIntrospectionEnabled;
	private final AtomicLong idSequence = new AtomicLong(3L);
	private final Map<Long, UserRecord> users = new ConcurrentHashMap<>();
	private final Map<String, Long> emailIndex = new ConcurrentHashMap<>();
	private final Map<String, RefreshTokenRecord> refreshTokens = new ConcurrentHashMap<>();
	private final Map<String, PasswordResetTokenRecord> passwordResetTokens = new ConcurrentHashMap<>();
	private final Map<String, String> latestResetTokenByEmail = new ConcurrentHashMap<>();

	@Autowired
	public InMemoryUserStore(
		Clock clock,
		PasswordHasher passwordHasher,
		@Value("${app.root-admin.email}") String rootEmail,
		@Value("${app.root-admin.password}") String rootPassword,
		@Value("${app.seed-agent.first-name:Agent}") String seedAgentFirstName,
		@Value("${app.seed-agent.last-name:One}") String seedAgentLastName,
		@Value("${app.seed-agent.email:agent1@crm.com}") String seedAgentEmail,
		@Value("${app.seed-agent.password:V7!mQ2#pL9@xR4$k}") String seedAgentPassword,
		Environment environment
	) {
		this(
			clock,
			passwordHasher,
			rootEmail,
			rootPassword,
			seedAgentFirstName,
			seedAgentLastName,
			seedAgentEmail,
			seedAgentPassword,
			environment.acceptsProfiles(Profiles.of("local", "test"))
		);
	}

	InMemoryUserStore(
		Clock clock,
		PasswordHasher passwordHasher,
		String rootEmail,
		String rootPassword
	) {
		this(
			clock,
			passwordHasher,
			rootEmail,
			rootPassword,
			DEFAULT_SEED_AGENT_FIRST_NAME,
			DEFAULT_SEED_AGENT_LAST_NAME,
			DEFAULT_SEED_AGENT_EMAIL,
			DEFAULT_SEED_AGENT_PASSWORD,
			false
		);
	}

	InMemoryUserStore(
		Clock clock,
		PasswordHasher passwordHasher,
		String rootEmail,
		String rootPassword,
		boolean testResetIntrospectionEnabled
	) {
		this(
			clock,
			passwordHasher,
			rootEmail,
			rootPassword,
			DEFAULT_SEED_AGENT_FIRST_NAME,
			DEFAULT_SEED_AGENT_LAST_NAME,
			DEFAULT_SEED_AGENT_EMAIL,
			DEFAULT_SEED_AGENT_PASSWORD,
			testResetIntrospectionEnabled
		);
	}

	InMemoryUserStore(
		Clock clock,
		PasswordHasher passwordHasher,
		String rootEmail,
		String rootPassword,
		String seedAgentFirstName,
		String seedAgentLastName,
		String seedAgentEmail,
		String seedAgentPassword,
		boolean testResetIntrospectionEnabled
	) {
		this.clock = clock;
		this.passwordHasher = passwordHasher;
		this.testResetIntrospectionEnabled = testResetIntrospectionEnabled;
		seedRootAdmin(rootEmail, rootPassword);
		seedDefaultAgent(seedAgentFirstName, seedAgentLastName, seedAgentEmail, seedAgentPassword);
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
			now,
			null,
			null,
			null,
			null,
			null
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
		if (isRootAdminDbId(dbId)) {
			throw new AccessDeniedException("root_admin");
		}
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
			now,
			existing.archivedAt(),
			existing.archivedBy(),
			existing.archivalReason(),
			existing.reinstatedAt(),
			existing.reinstatedBy()
		);

		users.put(dbId, updated);
		if (!existing.email().equals(newEmail)) {
			emailIndex.remove(existing.email());
			emailIndex.put(newEmail, dbId);
		}
		return toDto(updated);
	}

	/**
	 * Archives a user and removes any associated refresh tokens.
	 *
	 * @param userId API user identifier
	 * @throws AccessDenied when attempting to archive the root admin
	 */
	@Override
	public void archiveUser(String userId, String archivedByUserId, String archivalReason) {
		long dbId = decodeUserId(userId);
		if (dbId == ROOT_ADMIN_DB_ID) {
			throw new AccessDeniedException("root_admin");
		}
		long archivedByDbId = decodeUserId(archivedByUserId);
		loadByDbId(archivedByDbId);
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
			now,
			now,
			archivedByDbId,
			archivalReason == null || archivalReason.isBlank() ? null : archivalReason.trim(),
			null,
			null
		);
		users.put(dbId, updated);
		refreshTokens.entrySet().removeIf(e -> e.getValue().dbUserId == dbId);
	}

	@Override
	public UserDto reinstateUser(String userId, String reinstatedByUserId) {
		long dbId = decodeUserId(userId);
		long reinstatedByDbId = decodeUserId(reinstatedByUserId);
		loadByDbId(reinstatedByDbId);
		UserRecord existing = loadByDbId(dbId);
		Instant now = clock.instant();
		UserRecord updated = new UserRecord(
			dbId,
			existing.firstName(),
			existing.lastName(),
			existing.email(),
			existing.role(),
			UserStatus.active,
			existing.passwordHash(),
			existing.createdAt(),
			now,
			existing.archivedAt(),
			existing.archivedBy(),
			existing.archivalReason(),
			now,
			reinstatedByDbId
		);
		users.put(dbId, updated);
		return toDto(updated);
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
		if (isRootAdminDbId(dbId)) {
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
			UserStatus.disabled,
			existing.passwordHash(),
			existing.createdAt(),
			now,
			existing.archivedAt(),
			existing.archivedBy(),
			existing.archivalReason(),
			existing.reinstatedAt(),
			existing.reinstatedBy()
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
		if (isRootAdminDbId(dbId)) {
			throw new AccessDeniedException("root_admin");
		}
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
			now,
			existing.archivedAt(),
			existing.archivedBy(),
			existing.archivalReason(),
			existing.reinstatedAt(),
			existing.reinstatedBy()
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
		List<UserRecord> records = new ArrayList<>(users.values()
			.stream()
			.filter(u -> u.status() != UserStatus.deleted)
			.toList());
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
			return users.values().stream().filter(u -> u.status() != UserStatus.deleted).count();
		}
		UserRole role = UserRole.fromWireValue(normalizedRole);
		return users.values().stream().filter(u -> u.status() != UserStatus.deleted && u.role == role).count();
	}

	@Override
	public List<UserDto> listArchivedUsers(int limit, int offset, String roleFilter, String archivedByUserId) {
		String normalizedRole = roleFilter == null ? null : roleFilter.trim();
		Long archivedByDbId = archivedByUserId == null ? null : decodeUserId(archivedByUserId);
		List<UserRecord> records = new ArrayList<>(users.values()
			.stream()
			.filter(u -> u.status() == UserStatus.deleted)
			.filter(u -> archivedByDbId == null || Objects.equals(archivedByDbId, u.archivedBy()))
			.toList());
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

	@Override
	public long countArchivedUsers(String roleFilter, String archivedByUserId) {
		String normalizedRole = roleFilter == null ? null : roleFilter.trim();
		Long archivedByDbId = archivedByUserId == null ? null : decodeUserId(archivedByUserId);
		if (normalizedRole == null || normalizedRole.isBlank()) {
			return users.values().stream()
				.filter(u -> u.status() == UserStatus.deleted)
				.filter(u -> archivedByDbId == null || Objects.equals(archivedByDbId, u.archivedBy()))
				.count();
		}
		UserRole role = UserRole.fromWireValue(normalizedRole);
		return users.values().stream()
			.filter(u -> u.status() == UserStatus.deleted)
			.filter(u -> u.role == role)
			.filter(u -> archivedByDbId == null || Objects.equals(archivedByDbId, u.archivedBy()))
			.count();
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
			now,
			null,
			null,
			null,
			null,
			null
		);
		users.put(ROOT_ADMIN_DB_ID, root);
		emailIndex.put(normalizedEmail, ROOT_ADMIN_DB_ID);
	}

	private void seedDefaultAgent(String firstName, String lastName, String email, String password) {
		if (email == null || email.isBlank()) {
			return;
		}
		String normalizedEmail = normalizeEmail(email);
		if (emailIndex.containsKey(normalizedEmail)) {
			return;
		}
		long id = 2L;
		Instant now = clock.instant();
		UserRecord seedAgent = new UserRecord(
			id,
			firstName,
			lastName,
			normalizedEmail,
			UserRole.user,
			UserStatus.active,
			passwordHasher.hash(password),
			now,
			now,
			null,
			null,
			null,
			null,
			null
		);
		users.put(id, seedAgent);
		emailIndex.put(normalizedEmail, id);
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

	private static boolean isRootAdminDbId(long dbId) {
		return dbId == ROOT_ADMIN_DB_ID;
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
			record.updatedAt(),
			record.archivedAt(),
			record.archivedBy() == null ? null : encodeUserId(record.archivedBy()),
			record.archivalReason(),
			record.reinstatedAt(),
			record.reinstatedBy() == null ? null : encodeUserId(record.reinstatedBy())
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
		Instant updatedAt,
		Instant archivedAt,
		Long archivedBy,
		String archivalReason,
		Instant reinstatedAt,
		Long reinstatedBy
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
		passwordResetTokens.entrySet().removeIf(e -> e.getValue().dbUserId == dbId);
		passwordResetTokens.put(
			hashToken(token),
			new PasswordResetTokenRecord(dbId, normalized, clock.instant().plus(RESET_TTL))
		);
		if (testResetIntrospectionEnabled) {
			latestResetTokenByEmail.put(normalized, token);
		}
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
		if (!testResetIntrospectionEnabled) {
			return null;
		}
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
		PasswordResetTokenRecord record = passwordResetTokens.remove(hashToken(token));
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
			now,
			existing.archivedAt(),
			existing.archivedBy(),
			existing.archivalReason(),
			existing.reinstatedAt(),
			existing.reinstatedBy()
		);
		users.put(existing.id(), updated);
		refreshTokens.entrySet().removeIf(e -> e.getValue().dbUserId == existing.id());
		latestResetTokenByEmail.computeIfPresent(record.email, (_email, latestToken) ->
			latestToken.equals(token) ? null : latestToken
		);
	}

	private static String hashToken(String token) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
			return HEX_FORMAT.formatHex(hash);
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("failed to hash reset token", ex);
		}
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
		String email,
		Instant expiresAt
	) {}
}
