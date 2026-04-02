package com.scroogebank.crm.user_service.service;

import com.scroogebank.crm.user_service.api.Pagination;
import com.scroogebank.crm.user_service.dto.CreateUserRequest;
import com.scroogebank.crm.user_service.dto.ResetPasswordRequest;
import com.scroogebank.crm.user_service.dto.UpdateUserRequest;
import com.scroogebank.crm.user_service.dto.UserDto;
import com.scroogebank.crm.user_service.dto.UserRole;
import com.scroogebank.crm.user_service.dto.UsersListResponse;
import com.scroogebank.crm.user_service.security.AuthenticatedUser;	
import com.scroogebank.crm.user_service.exception.AccessDeniedException;
import com.scroogebank.crm.user_service.exception.UserNotFoundException;
import org.springframework.lang.Nullable;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Orchestrates user account operations backed by the user store.
 */
@Service
public class UserAccountService {
	private static final String ROOT_ADMIN_USER_ID = "usr_1";

	private final PersistentUserStore store;
	private final CognitoService cognitoService;
	private final boolean cognitoSyncEnabled;

	public UserAccountService(
		PersistentUserStore store,
		@Nullable CognitoService cognitoService,
		@Value("${app.jwt.auth-mode:local}") String authMode
	) {
		this.store = store;
		this.cognitoService = cognitoService;
		this.cognitoSyncEnabled = !"local".equalsIgnoreCase(authMode == null ? "" : authMode.trim());
	}

	/**
	 * Creates a new user account.
	 *
	 * @param request create user payload
	 * @return created user
	 */
	public UserDto createUser(CreateUserRequest request, AuthenticatedUser requester) {
		validateHierarchyPermissions(requester, request.role(), "create");

		if (cognitoService == null || !cognitoSyncEnabled) {
			return store.createUser(request);
		}

		String cognitoGroup = request.role() == UserRole.admin ? "ADMIN" : "USER";
		String fullName = request.firstName() + " " + request.lastName();
		cognitoService.createUser(request.email(), fullName, cognitoGroup);
		try {
			return store.createUser(request);
		}
		catch (RuntimeException ex) {
			// Compensate to avoid leaving a Cognito-only user when DB write fails.
			try {
				cognitoService.deleteUser(request.email());
			}
			catch (RuntimeException cleanupEx) {
				ex.addSuppressed(cleanupEx);
			}
			throw ex;
		}
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
		// Check if user exists
		UserDto existingUser = store.getUser(userId);
		if (existingUser == null) {
			throw new UserNotFoundException(userId);
		}

		// Retrieve own data is always allowed
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
	public UserDto updateUser(String userId, UpdateUserRequest request, AuthenticatedUser user) {
		// Check if user exists
		UserDto existingUser = store.getUser(userId);
		if (existingUser == null) {
			throw new UserNotFoundException(userId);
		}

		validateUpdatePermissions(userId, user, existingUser.role(), request.role());

		// Delegate to the store when validation passes
		return store.updateUser(userId, request);
	}

	/**
	 * Deletes a user by id.
	 *
	 * @param userId API user identifier
	 * @param user authenticated user performing the delete
	 */
	public void deleteUser(String userId, AuthenticatedUser user) {
		// Look up the target user's role
		UserDto target = store.getUser(userId);
		if (target == null) {
			throw new UserNotFoundException(userId);
		}
		UserRole targetRole = target.role();

		validateHierarchyPermissions(user, targetRole, "delete");

		CognitoService cognitoService = getCognitoServiceOrNull();
		if (cognitoService != null) {
			cognitoService.deleteUser(target.email());
		}
		store.deleteUser(userId);
	}

	/**
	 * Disables a user by id.
	 *
	 * @param userId API user identifier
	 * @return updated user DTO
	 */
	public UserDto disableUser(String userId, AuthenticatedUser user) {

		// Look up the target user's role
		UserDto target = store.getUser(userId);
		if (target == null) {
			throw new UserNotFoundException(userId);
		}
		if (isRootAdminUserId(target.id())) {
			throw new AccessDeniedException("Root admin accounts cannot be disabled via the API");
		}
		UserRole targetRole = target.role();
		
		validateHierarchyPermissions(user, targetRole, "disable");

		CognitoService cognitoService = getCognitoServiceOrNull();
		if (cognitoService != null) {
			cognitoService.disableUser(target.email());
		}
		return store.disableUser(userId);
	}

	/**
	 * Resets the user's password and invalidates refresh tokens.
	 *
	 * @param userId API user identifier
	 * @param _request reset payload (currently unused)
	 */
	public void resetPassword(String userId, ResetPasswordRequest request, AuthenticatedUser requester) {
		// Look up the target user's role
		UserDto target = store.getUser(userId);
		if (target == null) {
			throw new UserNotFoundException(userId);
		}
		if (isRootAdminUserId(target.id())) {
			throw new AccessDeniedException("Root admin accounts cannot be reset via the admin API");
		}
		UserRole targetRole = target.role();

		// Self-reset must use forgot-password flow and is not supported on admin reset route.
		if (target.id().equals(requester.userId())) {
			throw new AccessDeniedException("self_reset_not_supported_use_forgot_password");
		}
		validateHierarchyPermissions(requester, targetRole, "reset password for");

		CognitoService cognitoService = getCognitoServiceOrNull();
		if (cognitoService != null) {
			cognitoService.resetPassword(target.email());
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
			case super_admin -> {
				throw new AccessDeniedException("Root admin accounts cannot be " + action + " via the API");
			}
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
}
