package com.scroogebank.crm.user_service.service;

import com.scroogebank.crm.user_service.api.Pagination;
import com.scroogebank.crm.user_service.dto.CreateUserRequest;
import com.scroogebank.crm.user_service.dto.ResetPasswordRequest;
import com.scroogebank.crm.user_service.dto.UpdateUserRequest;
import com.scroogebank.crm.user_service.dto.UserDto;
import com.scroogebank.crm.user_service.dto.UserRole;
import com.scroogebank.crm.user_service.dto.UserStatus;
import com.scroogebank.crm.user_service.dto.UsersListResponse;
import com.scroogebank.crm.user_service.exception.AccessDeniedException;
import com.scroogebank.crm.user_service.exception.UserNotFoundException;
import com.scroogebank.crm.user_service.logging.UserAuditLogger;
import com.scroogebank.crm.user_service.security.AuthenticatedUser;
import java.security.SecureRandom;
import org.jspecify.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Orchestrates user account operations backed by the user store.
 */
@Service
public class UserAccountService {
	private static final Logger LOGGER = LoggerFactory.getLogger(UserAccountService.class);
	private static final String ROOT_ADMIN_USER_ID = "usr_1";
	private static final int GENERATED_TEMP_PASSWORD_LENGTH = 16;
	private static final String PASSWORD_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	private static final String PASSWORD_LOWER = "abcdefghijklmnopqrstuvwxyz";
	private static final String PASSWORD_DIGIT = "0123456789";
	private static final String PASSWORD_SYMBOL = "!@#$%&*?";
	private static final String PASSWORD_ALL = PASSWORD_UPPER + PASSWORD_LOWER + PASSWORD_DIGIT + PASSWORD_SYMBOL;
	private static final SecureRandom PASSWORD_RANDOM = new SecureRandom();

	private final PersistentUserStore store;
	private final UserAuditLogger userAuditLogger;
	private final CognitoService cognitoService;
	private final boolean cognitoSyncEnabled;

	public UserAccountService(
		PersistentUserStore store,
		UserAuditLogger userAuditLogger,
		@Nullable CognitoService cognitoService,
		@Value("${app.jwt.auth-mode:local}") String authMode
	) {
		this.store = store;
		this.userAuditLogger = userAuditLogger;
		this.cognitoService = cognitoService;
		this.cognitoSyncEnabled = !"local".equalsIgnoreCase(authMode == null ? "" : authMode.trim());
	}

	/**
	 * Creates a new user account.
	 *
	 * @param request create user payload
	 * @return created user
	 */
	public UserDto createUser(
		CreateUserRequest request,
		AuthenticatedUser requester,
		String authorizationHeader,
		String correlationId
	) {
		validateHierarchyPermissions(requester, request.role(), "create");

		UserDto created;
		CognitoService cognito = getCognitoServiceOrNull();
		if (cognito == null) {
			created = store.createUser(request);
		}
		else {
			CreateUserRequest normalizedRequest = request.temporaryPassword() == null || request.temporaryPassword().isBlank()
				? withTemporaryPassword(request, generateProvisioningPassword())
				: request;
			String cognitoGroup = request.role() == UserRole.admin ? "ADMIN" : "USER";
			String fullName = request.firstName() + " " + request.lastName();
			cognito.createUser(normalizedRequest.email(), fullName, cognitoGroup, normalizedRequest.temporaryPassword());
			try {
				created = store.createUser(normalizedRequest);
			}
			catch (RuntimeException ex) {
				// Compensate to avoid leaving a Cognito-only user when DB write fails.
				try {
					cognito.deleteUser(normalizedRequest.email());
				}
				catch (RuntimeException cleanupEx) {
					ex.addSuppressed(cleanupEx);
				}
				throw ex;
			}
		}

		publishAuditSafe(
			"CREATE",
			"User ID",
			null,
			created.id(),
			requester.userId(),
			created.id(),
			correlationId,
			authorizationHeader
		);
		return created;
	}

	private CognitoService getCognitoServiceOrNull() {
		if (!cognitoSyncEnabled) {
			return null;
		}
		return cognitoService;
	}

	/**
	 * Lists users with normalized paging parameters.
	 *
	 * @param limit requested page size
	 * @param offset requested offset
	 * @param role optional role filter
	 * @return paginated user list
	 */
	public UsersListResponse listUsers(int limit, int offset, String role, AuthenticatedUser requester) {
		String normalizedRole = role == null ? null : role.trim();
		if (normalizedRole != null && normalizedRole.isBlank()) {
			normalizedRole = null;
		}
		UserRole roleFilter = normalizedRole == null ? null : UserRole.fromWireValue(normalizedRole);
		validateListPermissions(requester, roleFilter);

		int normalizedLimit = Math.max(1, Math.min(200, limit));
		int normalizedOffset = Math.max(0, offset);
		long total = store.countUsers(normalizedRole);
		return new UsersListResponse(
			store.listUsers(normalizedLimit, normalizedOffset, normalizedRole),
			new Pagination(normalizedLimit, normalizedOffset, total)
		);
	}

	/**
	 * Fetches a user by id.
	 *
	 * @param userId API user identifier
	 * @return user DTO
	 */
	public UserDto getUser(String userId, AuthenticatedUser requester) {
		UserDto existingUser = store.getUser(userId);
		if (existingUser == null || isDeleted(existingUser)) {
			throw new UserNotFoundException(userId);
		}

		if (existingUser.id().equals(requester.userId())) {
			return existingUser;
		}
		validateHierarchyPermissions(requester, existingUser.role(), "list");
		return existingUser;
	}

	/**
	 * Updates a user by id.
	 *
	 * @param userId API user identifier
	 * @param request update payload
	 * @return updated user DTO
	 */
	public UserDto updateUser(
		String userId,
		UpdateUserRequest request,
		AuthenticatedUser user,
		String authorizationHeader,
		String correlationId
	) {
		UserDto existingUser = store.getUser(userId);
		if (existingUser == null || isDeleted(existingUser)) {
			throw new UserNotFoundException(userId);
		}

		validateUpdatePermissions(userId, user, existingUser.role(), request.role());
		UserDto updated = store.updateUser(userId, request);

		StringBuilder attrs = new StringBuilder();
		StringBuilder befores = new StringBuilder();
		StringBuilder afters = new StringBuilder();
		appendIfChanged(attrs, befores, afters, "firstName", existingUser.firstName(), updated.firstName());
		appendIfChanged(attrs, befores, afters, "lastName", existingUser.lastName(), updated.lastName());
		appendIfChanged(attrs, befores, afters, "email", existingUser.email(), updated.email());
		appendIfChanged(
			attrs,
			befores,
			afters,
			"role",
			existingUser.role() != null ? existingUser.role().name() : null,
			updated.role() != null ? updated.role().name() : null
		);
		if (!attrs.isEmpty()) {
			publishAuditSafe(
				"UPDATE",
				attrs.toString(),
				befores.toString(),
				afters.toString(),
				user.userId(),
				userId,
				correlationId,
				authorizationHeader
			);
		}

		return updated;
	}

	/**
	 * Deletes a user by id.
	 *
	 * @param userId API user identifier
	 * @param user authenticated user performing the delete
	 */
	public void deleteUser(String userId, AuthenticatedUser user, String authorizationHeader, String correlationId) {
		UserDto target = store.getUser(userId);
		if (target == null || isDeleted(target)) {
			throw new UserNotFoundException(userId);
		}

		validateHierarchyPermissions(user, target.role(), "delete");
		CognitoService cognito = getCognitoServiceOrNull();
		if (cognito != null) {
			cognito.deleteUser(target.email());
		}
		store.deleteUser(userId);
		publishAuditSafe("DELETE", "User ID", userId, null, user.userId(), userId, correlationId, authorizationHeader);
	}

	/**
	 * Disables a user by id.
	 *
	 * @param userId API user identifier
	 * @return updated user DTO
	 */
	public UserDto disableUser(String userId, AuthenticatedUser user, String authorizationHeader, String correlationId) {
		UserDto target = store.getUser(userId);
		if (target == null || isDeleted(target)) {
			throw new UserNotFoundException(userId);
		}
		if (isRootAdminUserId(target.id())) {
			throw new AccessDeniedException("Root admin accounts cannot be disabled via the API");
		}

		validateHierarchyPermissions(user, target.role(), "disable");
		CognitoService cognito = getCognitoServiceOrNull();
		if (cognito != null) {
			cognito.disableUser(target.email());
		}
		UserDto disabled = store.disableUser(userId);
		publishAuditSafe("UPDATE", "status", "active", "disabled", user.userId(), userId, correlationId, authorizationHeader);
		return disabled;
	}

	/**
	 * Resets the user's password and invalidates refresh tokens.
	 *
	 * @param userId API user identifier
	 * @param request reset payload (currently unused)
	 */
	public void resetPassword(String userId, ResetPasswordRequest request, AuthenticatedUser requester) {
		UserDto target = store.getUser(userId);
		if (target == null || isDeleted(target)) {
			throw new UserNotFoundException(userId);
		}
		if (isRootAdminUserId(target.id())) {
			throw new AccessDeniedException("Root admin accounts cannot be reset via the admin API");
		}
		if (target.id().equals(requester.userId())) {
			throw new AccessDeniedException("self_reset_not_supported_use_forgot_password");
		}

		validateHierarchyPermissions(requester, target.role(), "reset password for");
		CognitoService cognito = getCognitoServiceOrNull();
		if (cognito != null) {
			cognito.resetPassword(target.email());
		}
		store.resetPassword(userId);
	}

	private void validateListPermissions(AuthenticatedUser requester, UserRole roleFilter) {
		if (roleFilter == null) {
			if (requester.role() == UserRole.super_admin || isSeededRootAdmin(requester)) {
				return;
			}
			throw new AccessDeniedException("Only root admins can list all users. Admins must filter with role=user.");
		}
		validateHierarchyPermissions(requester, roleFilter, "list");
	}

	private void validateHierarchyPermissions(AuthenticatedUser requester, UserRole targetRole, String action) {
		switch (targetRole) {
			case super_admin -> throw new AccessDeniedException("Root admin accounts cannot be " + action + " via the API");
			case admin -> {
				if (requester.role() != UserRole.super_admin && !isSeededRootAdmin(requester)) {
					throw new AccessDeniedException("Only root admins can " + action + " admin user.");
				}
			}
			case user -> {
				if (requester.role() != UserRole.super_admin && requester.role() != UserRole.admin) {
					throw new AccessDeniedException("Only admins or root admins can " + action + " users");
				}
			}
			default -> throw new AccessDeniedException("Unsupported role assignment: " + targetRole);
		}
	}

	private void validateUpdatePermissions(
		String userId,
		AuthenticatedUser requester,
		UserRole existingRole,
		UserRole requestedRole
	) {
		if (isRootAdminUserId(userId)) {
			throw new AccessDeniedException("Root admin accounts cannot be updated via the API");
		}
		if (existingRole == UserRole.super_admin || requestedRole == UserRole.super_admin) {
			throw new AccessDeniedException("Root admin accounts cannot be updated via the API");
		}

		UserRole permissionTarget = (existingRole == UserRole.admin || requestedRole == UserRole.admin)
			? UserRole.admin
			: UserRole.user;

		switch (permissionTarget) {
			case admin -> {
				if (
					requester.role() == UserRole.admin
					&& !requester.userId().equals(userId)
					&& !isSeededRootAdmin(requester)
				) {
					throw new AccessDeniedException("Admin can only update themselves");
				}
				if (requester.role() != UserRole.super_admin && !isSeededRootAdmin(requester)) {
					throw new AccessDeniedException("Only root admins can update admin user");
				}
			}
			case user -> {
				if (requester.role() == UserRole.user && !requester.userId().equals(userId)) {
					throw new AccessDeniedException("User can only update themselves");
				}
			}
			default -> throw new AccessDeniedException("Unsupported role assignment: " + permissionTarget);
		}
	}

	private static boolean isRootAdminUserId(String userId) {
		return ROOT_ADMIN_USER_ID.equals(userId);
	}

	private boolean isSeededRootAdmin(AuthenticatedUser requester) {
		return isRootAdminUserId(requester.userId());
	}

	private static boolean isDeleted(UserDto user) {
		return user.status() == UserStatus.deleted;
	}

	private void publishAuditSafe(
		String action,
		String attributeName,
		String beforeValue,
		String afterValue,
		String userId,
		String clientId,
		String correlationId,
		String authorizationHeader
	) {
		if (authorizationHeader == null || authorizationHeader.isBlank()) {
			return;
		}
		try {
			userAuditLogger.logAuditEvent(
				action,
				attributeName,
				beforeValue,
				afterValue,
				userId,
				clientId,
				correlationId,
				authorizationHeader
			);
		}
		catch (Exception ex) {
			LOGGER.warn("User operation completed but audit logging failed. action={} targetUserId={}", action, clientId, ex);
		}
	}

	private static void appendIfChanged(
		StringBuilder attrs,
		StringBuilder befores,
		StringBuilder afters,
		String name,
		String oldVal,
		String newVal
	) {
		if (newVal != null && !newVal.equals(oldVal)) {
			if (!attrs.isEmpty()) {
				attrs.append(", ");
				befores.append(", ");
				afters.append(", ");
			}
			attrs.append(name);
			befores.append(oldVal);
			afters.append(newVal);
		}
	}

	private static CreateUserRequest withTemporaryPassword(CreateUserRequest request, String temporaryPassword) {
		return new CreateUserRequest(
			request.firstName(),
			request.lastName(),
			request.email(),
			request.role(),
			request.sendInviteEmail(),
			temporaryPassword
		);
	}

	private static String generateProvisioningPassword() {
		char[] chars = new char[GENERATED_TEMP_PASSWORD_LENGTH];
		chars[0] = randomChar(PASSWORD_UPPER);
		chars[1] = randomChar(PASSWORD_LOWER);
		chars[2] = randomChar(PASSWORD_DIGIT);
		chars[3] = randomChar(PASSWORD_SYMBOL);
		for (int i = 4; i < chars.length; i++) {
			chars[i] = randomChar(PASSWORD_ALL);
		}
		shuffle(chars);
		return new String(chars);
	}

	private static char randomChar(String source) {
		return source.charAt(PASSWORD_RANDOM.nextInt(source.length()));
	}

	private static void shuffle(char[] chars) {
		for (int i = chars.length - 1; i > 0; i--) {
			int j = PASSWORD_RANDOM.nextInt(i + 1);
			char tmp = chars[i];
			chars[i] = chars[j];
			chars[j] = tmp;
		}
	}
}
