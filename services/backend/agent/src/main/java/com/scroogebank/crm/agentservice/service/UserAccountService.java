package com.scroogebank.crm.agentservice.service;

import com.scroogebank.crm.agentservice.api.Pagination;
import com.scroogebank.crm.agentservice.dto.CreateUserRequest;
import com.scroogebank.crm.agentservice.dto.ResetPasswordRequest;
import com.scroogebank.crm.agentservice.dto.UpdateUserRequest;
import com.scroogebank.crm.agentservice.dto.UserDto;
import com.scroogebank.crm.agentservice.dto.UserRole;
import com.scroogebank.crm.agentservice.dto.UsersListResponse;
import com.scroogebank.crm.agentservice.security.AuthenticatedUser;	
import com.scroogebank.crm.agentservice.exception.AccessDeniedException;
import com.scroogebank.crm.agentservice.exception.UserNotFoundException;
import org.springframework.stereotype.Service;

/**
 * Orchestrates user account operations backed by the user store.
 */
@Service
public class UserAccountService {
	private final UserStore store;

	public UserAccountService(UserStore store) {
		this.store = store;
	}

	/**
	 * Creates a new user account.
	 *
	 * @param request create user payload
	 * @return created user
	 */
	public UserDto createUser(CreateUserRequest request, AuthenticatedUser requester) {
		validateHierarchyPermissions(requester, request.role(), "create");

        return store.createUser(request);
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
		validateHierarchyPermissions(requester, UserRole.fromWireValue(role), "list");

		int normalizedLimit = Math.max(1, Math.min(200, limit));
		int normalizedOffset = Math.max(0, offset);
		long total = store.countUsers(role);
		return new UsersListResponse(
			store.listUsers(normalizedLimit, normalizedOffset, role),
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

		validateUpdatePermissions(userId, user, request.role());

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

		// Root-admin protection and actual delete are enforced in the store
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
		UserRole targetRole = target.role();
		
		validateHierarchyPermissions(user, targetRole, "disable");

		// Disable user
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
		UserRole targetRole = target.role();

		// Reset own password is always allowed
		if (target.id().equals(requester.userId())) {
			return;
		}
		validateHierarchyPermissions(requester, targetRole, "reset password for");
		store.resetPassword(userId);
	}

	private void validateHierarchyPermissions(AuthenticatedUser requester, UserRole targetRole, String action) {
        switch (targetRole) {
			case super_admin -> {
				throw new AccessDeniedException("Root admin accounts cannot be " + action + " via the API");
			}
            case admin -> {
                if (requester.role() != UserRole.super_admin) {
                    throw new AccessDeniedException("Only root admins can " + action + " admin user.");
                }
				return;
            }
            case agent -> {
                if (requester.role() != UserRole.super_admin && requester.role() != UserRole.admin) {
                    throw new AccessDeniedException("Only admins or root admins can " + action + " agents");
                }
				return;
            }
            default -> throw new AccessDeniedException("Unsupported role assignment: " + targetRole);
        }
    }

	private void validateUpdatePermissions(String userId, AuthenticatedUser requester, UserRole targetRole) {
        switch (targetRole) {
			case super_admin -> {
				throw new AccessDeniedException("Root admin accounts cannot be updated via the API");
			}
            case admin -> {
				if (requester.role() == UserRole.admin && !requester.userId().equals(userId)) {
					throw new AccessDeniedException("Admin can only update themselves");
				}
                if (requester.role() != UserRole.super_admin) {
                    throw new AccessDeniedException("Only root admins can update admin user");
                }
				return;
            }
            case agent -> {
				if (requester.role() == UserRole.agent && !requester.userId().equals(userId)) {
					throw new AccessDeniedException("Agent can only update themselves");
				}
				return;
            }
            default -> throw new AccessDeniedException("Unsupported role assignment: " + targetRole);
        }
	}
}