package com.scroogebank.crm.user_service.service;

import com.scroogebank.crm.user_service.dto.CreateUserRequest;
import com.scroogebank.crm.user_service.dto.UpdateUserRequest;
import com.scroogebank.crm.user_service.dto.UserDto;
import com.scroogebank.crm.user_service.dto.UserRole;
import com.scroogebank.crm.user_service.dto.UserStatus;
import com.scroogebank.crm.user_service.entity.RefreshTokenEntity;
import com.scroogebank.crm.user_service.entity.UserEntity;
import com.scroogebank.crm.user_service.exception.AccessDeniedException;
import com.scroogebank.crm.user_service.exception.DuplicateUserException;
import com.scroogebank.crm.user_service.exception.UserNotFoundException;
import com.scroogebank.crm.user_service.repository.RefreshTokenRepository;
import com.scroogebank.crm.user_service.repository.UserRepository;
import com.scroogebank.crm.user_service.util.IdCodec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * PostgreSQL-backed user store for production-safe multi-replica operation.
 */
@Component
@ConditionalOnProperty(name = "app.user-store.type", havingValue = "postgres")
public class PersistentUserStore implements UserStore {
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
	private final UserRepository userRepository;
	private final RefreshTokenRepository refreshTokenRepository;
	private final boolean testResetIntrospectionEnabled;
	private final String rootEmail;
	private final String rootPassword;
	private final String seedAgentFirstName;
	private final String seedAgentLastName;
	private final String seedAgentEmail;
	private final String seedAgentPassword;
	private final Map<String, PasswordResetTokenRecord> passwordResetTokens = new ConcurrentHashMap<>();
	private final Map<String, String> latestResetTokenByEmail = new ConcurrentHashMap<>();

	@Autowired
	public PersistentUserStore(
		Clock clock,
		PasswordHasher passwordHasher,
		UserRepository userRepository,
		RefreshTokenRepository refreshTokenRepository,
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
			userRepository,
			refreshTokenRepository,
			rootEmail,
			rootPassword,
			seedAgentFirstName,
			seedAgentLastName,
			seedAgentEmail,
			seedAgentPassword,
			environment.acceptsProfiles(Profiles.of("local", "test"))
		);
	}

	PersistentUserStore(
		Clock clock,
		PasswordHasher passwordHasher,
		UserRepository userRepository,
		RefreshTokenRepository refreshTokenRepository,
		String rootEmail,
		String rootPassword
	) {
		this(
			clock,
			passwordHasher,
			userRepository,
			refreshTokenRepository,
			rootEmail,
			rootPassword,
			DEFAULT_SEED_AGENT_FIRST_NAME,
			DEFAULT_SEED_AGENT_LAST_NAME,
			DEFAULT_SEED_AGENT_EMAIL,
			DEFAULT_SEED_AGENT_PASSWORD,
			false
		);
	}

	PersistentUserStore(
		Clock clock,
		PasswordHasher passwordHasher,
		UserRepository userRepository,
		RefreshTokenRepository refreshTokenRepository,
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
		this.userRepository = userRepository;
		this.refreshTokenRepository = refreshTokenRepository;
		this.testResetIntrospectionEnabled = testResetIntrospectionEnabled;
		this.rootEmail = rootEmail;
		this.rootPassword = rootPassword;
		this.seedAgentFirstName = seedAgentFirstName;
		this.seedAgentLastName = seedAgentLastName;
		this.seedAgentEmail = seedAgentEmail;
		this.seedAgentPassword = seedAgentPassword;
	}

	@Transactional
	@Override
	public UserDto createUser(CreateUserRequest request) {
		seedRootAdminIfMissing();
		String email = normalizeEmail(request.email());
		if (userRepository.findByEmail(email).isPresent()) {
			throw new DuplicateUserException("Email already exists.");
		}

		Instant now = clock.instant();
		String password = (request.temporaryPassword() == null || request.temporaryPassword().isBlank())
			? UUID.randomUUID().toString()
			: request.temporaryPassword();
		UserRole role = request.role();

		UserEntity entity = new UserEntity();
		entity.setFirstName(request.firstName());
		entity.setLastName(request.lastName());
		entity.setEmail(email);
		entity.setRole(role);
		entity.setStatus(UserStatus.active);
		entity.setPasswordHash(passwordHasher.hash(password));
		entity.setCreatedAt(now);
		entity.setUpdatedAt(now);

		try {
			return toDto(userRepository.save(entity));
		}
		catch (DataIntegrityViolationException ex) {
			throw new DuplicateUserException("Email already exists.");
		}
	}

	@Transactional
	@Override
	public UserDto updateUser(String userId, UpdateUserRequest patch) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		if (isRootAdminDbId(dbId)) {
			throw new AccessDeniedException("root_admin");
		}
		UserEntity existing = loadEntityById(dbId);

		String newEmail = patch.email() == null ? existing.getEmail() : normalizeEmail(patch.email());
		if (userRepository.existsByEmailAndIdNot(newEmail, dbId)) {
			throw new DuplicateUserException("Email already exists.");
		}

		existing.setFirstName(patch.firstName() == null ? existing.getFirstName() : patch.firstName());
		existing.setLastName(patch.lastName() == null ? existing.getLastName() : patch.lastName());
		existing.setEmail(newEmail);
		existing.setRole(patch.role() == null ? existing.getRole() : patch.role());
		existing.setUpdatedAt(clock.instant());
		return toDto(userRepository.save(existing));
	}

	@Transactional
	@Override
	public void archiveUser(String userId, String archivedByUserId, String archivalReason) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		long archivedByDbId = decodeUserId(archivedByUserId);
		loadEntityById(archivedByDbId);
		if (isRootAdminDbId(dbId)) {
			throw new AccessDeniedException("root_admin");
		}
		UserEntity existing = loadEntityById(dbId);
		existing.setStatus(UserStatus.deleted);
		existing.setArchivedAt(clock.instant());
		existing.setArchivedBy(archivedByDbId);
		existing.setArchivalReason(archivalReason == null || archivalReason.isBlank() ? null : archivalReason.trim());
		existing.setReinstatedAt(null);
		existing.setReinstatedBy(null);
		existing.setUpdatedAt(clock.instant());
		userRepository.save(existing);
		refreshTokenRepository.deleteByUser_Id(existing.getId());
	}

	@Transactional
	@Override
	public UserDto reinstateUser(String userId, String reinstatedByUserId) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		long reinstatedByDbId = decodeUserId(reinstatedByUserId);
		loadEntityById(reinstatedByDbId);
		UserEntity existing = loadEntityById(dbId);
		existing.setStatus(UserStatus.active);
		existing.setReinstatedAt(clock.instant());
		existing.setReinstatedBy(reinstatedByDbId);
		existing.setUpdatedAt(clock.instant());
		return toDto(userRepository.save(existing));
	}

	@Transactional
	@Override
	public UserDto disableUser(String userId) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		if (isRootAdminDbId(dbId)) {
			throw new AccessDeniedException("root_admin");
		}
		UserEntity existing = loadEntityById(dbId);
		existing.setStatus(UserStatus.disabled);
		existing.setUpdatedAt(clock.instant());
		return toDto(userRepository.save(existing));
	}

	@Transactional
	@Override
	public void resetPassword(String userId) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		if (isRootAdminDbId(dbId)) {
			throw new AccessDeniedException("root_admin");
		}
		UserEntity existing = loadEntityById(dbId);
		existing.setPasswordHash(passwordHasher.hash(UUID.randomUUID().toString()));
		existing.setUpdatedAt(clock.instant());
		userRepository.save(existing);
		refreshTokenRepository.deleteByUser_Id(existing.getId());
	}

	@Transactional
	@Override
	public UserDto getUser(String userId) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		return toDto(loadEntityById(dbId));
	}

	@Transactional
	@Override
	public InMemoryUserStore.UserRecord findByEmail(String email) {
		seedRootAdminIfMissing();
		return userRepository
			.findByEmail(normalizeEmail(email))
			.map(PersistentUserStore::toRecord)
			.filter(record -> record.status() != UserStatus.deleted)
			.orElse(null);
	}

	@Transactional
	@Override
	public InMemoryUserStore.UserRecord loadRecord(String userId) {
		seedRootAdminIfMissing();
		return toRecord(loadEntityById(decodeUserId(userId)));
	}

	@Transactional
	@Override
	public List<UserDto> listUsers(int limit, int offset, String roleFilter) {
		seedRootAdminIfMissing();
		String normalizedRole = roleFilter == null ? null : roleFilter.trim();
		UserRole role = null;
		if (normalizedRole != null && !normalizedRole.isBlank()) {
			role = UserRole.fromWireValue(normalizedRole);
		}
		List<UserEntity> rows = role == null
			? userRepository.findAllByStatusNot(UserStatus.deleted, Sort.by(Sort.Direction.ASC, "id"))
			: userRepository.findAllByStatusNotAndRole(UserStatus.deleted, role, Sort.by(Sort.Direction.ASC, "id"));

		int normalizedLimit = Math.max(1, Math.min(200, limit));
		int normalizedOffset = Math.max(0, offset);
		int fromIndex = Math.min(normalizedOffset, rows.size());
		int toIndex = Math.min(fromIndex + normalizedLimit, rows.size());
		return rows.subList(fromIndex, toIndex).stream().map(PersistentUserStore::toDto).toList();
	}

	@Transactional
	@Override
	public long countUsers(String roleFilter) {
		seedRootAdminIfMissing();
		String normalizedRole = roleFilter == null ? null : roleFilter.trim();
		if (normalizedRole == null || normalizedRole.isBlank()) {
			return userRepository.countByStatusNot(UserStatus.deleted);
		}
		UserRole role = UserRole.fromWireValue(normalizedRole);
		return userRepository.countByStatusNotAndRole(UserStatus.deleted, role);
	}

	@Transactional
	@Override
	public List<UserDto> listArchivedUsers(int limit, int offset, String roleFilter, String archivedByUserId) {
		seedRootAdminIfMissing();
		String normalizedRole = roleFilter == null ? null : roleFilter.trim();
		UserRole role = null;
		if (normalizedRole != null && !normalizedRole.isBlank()) {
			role = UserRole.fromWireValue(normalizedRole);
		}
		Long archivedByDbId = archivedByUserId == null ? null : decodeUserId(archivedByUserId);
		List<UserEntity> rows;
		if (archivedByDbId == null) {
			rows = role == null
				? userRepository.findAllByStatus(UserStatus.deleted, Sort.by(Sort.Direction.ASC, "id"))
				: userRepository.findAllByStatusAndRole(UserStatus.deleted, role, Sort.by(Sort.Direction.ASC, "id"));
		}
		else {
			rows = role == null
				? userRepository.findAllByStatusAndArchivedBy(UserStatus.deleted, archivedByDbId, Sort.by(Sort.Direction.ASC, "id"))
				: userRepository.findAllByStatusAndRoleAndArchivedBy(
					UserStatus.deleted,
					role,
					archivedByDbId,
					Sort.by(Sort.Direction.ASC, "id")
				);
		}

		int normalizedLimit = Math.max(1, Math.min(200, limit));
		int normalizedOffset = Math.max(0, offset);
		int fromIndex = Math.min(normalizedOffset, rows.size());
		int toIndex = Math.min(fromIndex + normalizedLimit, rows.size());
		return rows.subList(fromIndex, toIndex).stream().map(PersistentUserStore::toDto).toList();
	}

	@Transactional
	@Override
	public long countArchivedUsers(String roleFilter, String archivedByUserId) {
		seedRootAdminIfMissing();
		String normalizedRole = roleFilter == null ? null : roleFilter.trim();
		UserRole role = null;
		if (normalizedRole != null && !normalizedRole.isBlank()) {
			role = UserRole.fromWireValue(normalizedRole);
		}
		Long archivedByDbId = archivedByUserId == null ? null : decodeUserId(archivedByUserId);
		if (archivedByDbId == null) {
			return role == null
				? userRepository.countByStatus(UserStatus.deleted)
				: userRepository.countByStatusAndRole(UserStatus.deleted, role);
		}
		return role == null
			? userRepository.countByStatusAndArchivedBy(UserStatus.deleted, archivedByDbId)
			: userRepository.countByStatusAndRoleAndArchivedBy(UserStatus.deleted, role, archivedByDbId);
	}

	@Transactional
	@Override
	public String issueRefreshToken(String userId) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		UserEntity user = loadEntityById(dbId);

		String rawToken = UUID.randomUUID().toString();
		RefreshTokenEntity entity = new RefreshTokenEntity();
		entity.setUser(user);
		entity.setTokenHash(hashToken(rawToken));
		entity.setExpiresAt(clock.instant().plus(REFRESH_TTL));
		refreshTokenRepository.save(entity);
		return rawToken;
	}

	@Transactional
	@Override
	public String rotateRefreshToken(String oldToken) {
		seedRootAdminIfMissing();
		RefreshTokenEntity current = refreshTokenRepository.findByTokenHash(hashToken(oldToken)).orElse(null);
		if (current == null) {
			return null;
		}
		if (clock.instant().isAfter(current.getExpiresAt())) {
			refreshTokenRepository.delete(current);
			return null;
		}

		UserEntity user = current.getUser();
		refreshTokenRepository.delete(current);

		String newRawToken = UUID.randomUUID().toString();
		RefreshTokenEntity replacement = new RefreshTokenEntity();
		replacement.setUser(user);
		replacement.setTokenHash(hashToken(newRawToken));
		replacement.setExpiresAt(clock.instant().plus(REFRESH_TTL));
		refreshTokenRepository.save(replacement);
		return newRawToken;
	}

	@Transactional
	@Override
	public boolean isRefreshTokenValid(String token) {
		seedRootAdminIfMissing();
		RefreshTokenEntity record = refreshTokenRepository.findByTokenHash(hashToken(token)).orElse(null);
		return record != null && clock.instant().isBefore(record.getExpiresAt());
	}

	@Transactional
	@Override
	public String userIdForRefreshToken(String token) {
		seedRootAdminIfMissing();
		RefreshTokenEntity record = refreshTokenRepository.findByTokenHash(hashToken(token)).orElse(null);
		if (record == null || clock.instant().isAfter(record.getExpiresAt())) {
			return null;
		}
		return encodeUserId(record.getUser().getId());
	}

	@Override
	public boolean verifyPassword(InMemoryUserStore.UserRecord record, String password) {
		return passwordHasher.verify(password, record.passwordHash());
	}

	@Override
	public String createPasswordResetToken(String email) {
		seedRootAdminIfMissing();
		String normalized = normalizeEmail(email);
		if (userRepository.findByEmail(normalized).isEmpty()) {
			return null;
		}
		String token = UUID.randomUUID().toString();
		passwordResetTokens.entrySet().removeIf(e -> e.getValue().email.equals(normalized));
		passwordResetTokens.put(
			hashToken(token),
			new PasswordResetTokenRecord(normalized, clock.instant().plus(RESET_TTL))
		);
		if (testResetIntrospectionEnabled) {
			latestResetTokenByEmail.put(normalized, token);
		}
		return token;
	}

	@Override
	public String getLatestResetToken(String email) {
		if (!testResetIntrospectionEnabled) {
			return null;
		}
		return latestResetTokenByEmail.get(normalizeEmail(email));
	}

	@Transactional
	@Override
	public void resetPasswordWithToken(String token, String newPassword) {
		seedRootAdminIfMissing();
		PasswordResetTokenRecord record = passwordResetTokens.remove(hashToken(token));
		if (record == null || clock.instant().isAfter(record.expiresAt)) {
			throw new IllegalArgumentException("invalid_or_expired_token");
		}
		UserEntity entity = userRepository.findByEmail(record.email)
			.orElseThrow(() -> new IllegalArgumentException("invalid_or_expired_token"));
		entity.setPasswordHash(passwordHasher.hash(newPassword));
		entity.setUpdatedAt(clock.instant());
		userRepository.save(entity);
		refreshTokenRepository.deleteByUser_Id(entity.getId());
		latestResetTokenByEmail.computeIfPresent(record.email, (_email, latestToken) ->
			latestToken.equals(token) ? null : latestToken
		);
	}

	private record PasswordResetTokenRecord(String email, Instant expiresAt) {}

	private void seedRootAdminIfMissing() {
		Instant now = clock.instant();

		if (userRepository.findById(ROOT_ADMIN_DB_ID).isEmpty()) {
			UserEntity root = new UserEntity();
			root.setFirstName("Root");
			root.setLastName("Admin");
			root.setEmail(normalizeEmail(rootEmail));
			root.setRole(UserRole.admin);
			root.setStatus(UserStatus.active);
			root.setPasswordHash(passwordHasher.hash(rootPassword));
			root.setCreatedAt(now);
			root.setUpdatedAt(now);
			userRepository.save(root);
		}

		if (seedAgentEmail == null || seedAgentEmail.isBlank()) {
			return;
		}
		String normalizedSeedAgentEmail = normalizeEmail(seedAgentEmail);
		if (userRepository.findByEmail(normalizedSeedAgentEmail).isPresent()) {
			return;
		}

		UserEntity seedAgent = new UserEntity();
		seedAgent.setFirstName(seedAgentFirstName);
		seedAgent.setLastName(seedAgentLastName);
		seedAgent.setEmail(normalizedSeedAgentEmail);
		seedAgent.setRole(UserRole.user);
		seedAgent.setStatus(UserStatus.active);
		seedAgent.setPasswordHash(passwordHasher.hash(seedAgentPassword));
		seedAgent.setCreatedAt(now);
		seedAgent.setUpdatedAt(now);
		userRepository.save(seedAgent);
	}

	private static boolean isRootAdminDbId(long dbId) {
		return dbId == ROOT_ADMIN_DB_ID;
	}

	private UserEntity loadEntityById(long dbId) {
		return userRepository.findById(dbId).orElseThrow(() -> new UserNotFoundException(encodeUserId(dbId)));
	}

	private static String hashToken(String token) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
			return HEX_FORMAT.formatHex(hash);
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException("failed to hash token", ex);
		}
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

	private static UserDto toDto(UserEntity entity) {
		return new UserDto(
			encodeUserId(entity.getId()),
			entity.getFirstName(),
			entity.getLastName(),
			entity.getEmail(),
			entity.getRole(),
			entity.getStatus(),
			entity.getCreatedAt(),
			entity.getUpdatedAt(),
			entity.getArchivedAt(),
			entity.getArchivedBy() == null ? null : encodeUserId(entity.getArchivedBy()),
			entity.getArchivalReason(),
			entity.getReinstatedAt(),
			entity.getReinstatedBy() == null ? null : encodeUserId(entity.getReinstatedBy())
		);
	}

	private static InMemoryUserStore.UserRecord toRecord(UserEntity entity) {
		return new InMemoryUserStore.UserRecord(
			entity.getId(),
			entity.getFirstName(),
			entity.getLastName(),
			entity.getEmail(),
			entity.getRole(),
			entity.getStatus(),
			entity.getPasswordHash(),
			entity.getCreatedAt(),
			entity.getUpdatedAt(),
			entity.getArchivedAt(),
			entity.getArchivedBy(),
			entity.getArchivalReason(),
			entity.getReinstatedAt(),
			entity.getReinstatedBy()
		);
	}
}
