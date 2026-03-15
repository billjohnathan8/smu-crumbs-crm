package com.scroogebank.crm.agentservice.service;

import com.scroogebank.crm.agentservice.dto.CreateUserRequest;
import com.scroogebank.crm.agentservice.dto.UpdateUserRequest;
import com.scroogebank.crm.agentservice.dto.UserDto;
import com.scroogebank.crm.agentservice.dto.UserRole;
import com.scroogebank.crm.agentservice.dto.UserStatus;
import com.scroogebank.crm.agentservice.entity.AgentRefreshTokenEntity;
import com.scroogebank.crm.agentservice.entity.AgentUserEntity;
import com.scroogebank.crm.agentservice.exception.AccessDeniedException;
import com.scroogebank.crm.agentservice.exception.DuplicateUserException;
import com.scroogebank.crm.agentservice.exception.UserNotFoundException;
import com.scroogebank.crm.agentservice.repository.AgentRefreshTokenRepository;
import com.scroogebank.crm.agentservice.repository.AgentUserRepository;
import com.scroogebank.crm.agentservice.util.IdCodec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
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
	private static final Duration REFRESH_TTL = Duration.ofDays(7);
	private static final HexFormat HEX_FORMAT = HexFormat.of();

	private final Clock clock;
	private final PasswordHasher passwordHasher;
	private final AgentUserRepository userRepository;
	private final AgentRefreshTokenRepository refreshTokenRepository;
	private final String rootEmail;
	private final String rootPassword;

	public PersistentUserStore(
		Clock clock,
		PasswordHasher passwordHasher,
		AgentUserRepository userRepository,
		AgentRefreshTokenRepository refreshTokenRepository,
		@Value("${app.root-admin.email}") String rootEmail,
		@Value("${app.root-admin.password}") String rootPassword
	) {
		this.clock = clock;
		this.passwordHasher = passwordHasher;
		this.userRepository = userRepository;
		this.refreshTokenRepository = refreshTokenRepository;
		this.rootEmail = rootEmail;
		this.rootPassword = rootPassword;
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
		UserRole role = request.role() == null ? UserRole.agent : request.role();

		AgentUserEntity entity = new AgentUserEntity();
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
		AgentUserEntity existing = loadEntityById(dbId);

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
	public void deleteUser(String userId) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		if (dbId == ROOT_ADMIN_DB_ID) {
			throw new AccessDeniedException("root_admin");
		}
		AgentUserEntity existing = loadEntityById(dbId);
		existing.setStatus(UserStatus.deleted);
		existing.setUpdatedAt(clock.instant());
		userRepository.save(existing);
	}

	@Transactional
	@Override
	public UserDto disableUser(String userId) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		AgentUserEntity existing = loadEntityById(dbId);
		existing.setStatus(UserStatus.disabled);
		existing.setUpdatedAt(clock.instant());
		return toDto(userRepository.save(existing));
	}

	@Transactional
	@Override
	public void resetPassword(String userId) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		AgentUserEntity existing = loadEntityById(dbId);
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
		final UserRole roleFilterValue = role;

		List<AgentUserEntity> rows = userRepository.findAll(Sort.by(Sort.Direction.ASC, "id"));
		if (roleFilterValue != null) {
			rows = rows.stream().filter(u -> u.getRole() == roleFilterValue).toList();
		}

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
			return userRepository.count();
		}
		UserRole role = UserRole.fromWireValue(normalizedRole);
		return userRepository.countByRole(role);
	}

	@Transactional
	@Override
	public String issueRefreshToken(String userId) {
		seedRootAdminIfMissing();
		long dbId = decodeUserId(userId);
		AgentUserEntity user = loadEntityById(dbId);

		String rawToken = UUID.randomUUID().toString();
		AgentRefreshTokenEntity entity = new AgentRefreshTokenEntity();
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
		AgentRefreshTokenEntity current = refreshTokenRepository.findByTokenHash(hashToken(oldToken)).orElse(null);
		if (current == null) {
			return null;
		}
		if (clock.instant().isAfter(current.getExpiresAt())) {
			refreshTokenRepository.delete(current);
			return null;
		}

		AgentUserEntity user = current.getUser();
		refreshTokenRepository.delete(current);

		String newRawToken = UUID.randomUUID().toString();
		AgentRefreshTokenEntity replacement = new AgentRefreshTokenEntity();
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
		AgentRefreshTokenEntity record = refreshTokenRepository.findByTokenHash(hashToken(token)).orElse(null);
		return record != null && clock.instant().isBefore(record.getExpiresAt());
	}

	@Transactional
	@Override
	public String userIdForRefreshToken(String token) {
		seedRootAdminIfMissing();
		AgentRefreshTokenEntity record = refreshTokenRepository.findByTokenHash(hashToken(token)).orElse(null);
		if (record == null || clock.instant().isAfter(record.getExpiresAt())) {
			return null;
		}
		return encodeUserId(record.getUser().getId());
	}

	@Override
	public boolean verifyPassword(InMemoryUserStore.UserRecord record, String password) {
		return passwordHasher.verify(password, record.passwordHash());
	}

	private void seedRootAdminIfMissing() {
		if (userRepository.count() > 0) {
			return;
		}

		AgentUserEntity root = new AgentUserEntity();
		root.setFirstName("Root");
		root.setLastName("Admin");
		root.setEmail(normalizeEmail(rootEmail));
		root.setRole(UserRole.admin);
		root.setStatus(UserStatus.active);
		root.setPasswordHash(passwordHasher.hash(rootPassword));
		root.setCreatedAt(clock.instant());
		root.setUpdatedAt(clock.instant());
		userRepository.save(root);
	}

	private AgentUserEntity loadEntityById(long dbId) {
		return userRepository.findById(dbId).orElseThrow(() -> new UserNotFoundException(encodeUserId(dbId)));
	}

	private static String hashToken(String token) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
			return HEX_FORMAT.formatHex(hash);
		}
		catch (Exception ex) {
			throw new IllegalStateException("failed to hash refresh token", ex);
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

	private static UserDto toDto(AgentUserEntity entity) {
		return new UserDto(
			encodeUserId(entity.getId()),
			entity.getFirstName(),
			entity.getLastName(),
			entity.getEmail(),
			entity.getRole(),
			entity.getStatus(),
			entity.getCreatedAt(),
			entity.getUpdatedAt()
		);
	}

	private static InMemoryUserStore.UserRecord toRecord(AgentUserEntity entity) {
		return new InMemoryUserStore.UserRecord(
			entity.getId(),
			entity.getFirstName(),
			entity.getLastName(),
			entity.getEmail(),
			entity.getRole(),
			entity.getStatus(),
			entity.getPasswordHash(),
			entity.getCreatedAt(),
			entity.getUpdatedAt()
		);
	}
}
