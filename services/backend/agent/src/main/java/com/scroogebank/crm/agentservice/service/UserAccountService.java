package com.scroogebank.crm.agentservice.service;

import com.scroogebank.crm.agentservice.api.Pagination;
import com.scroogebank.crm.agentservice.dto.CreateUserRequest;
import com.scroogebank.crm.agentservice.dto.ResetPasswordRequest;
import com.scroogebank.crm.agentservice.dto.UpdateUserRequest;
import com.scroogebank.crm.agentservice.dto.UserDto;
import com.scroogebank.crm.agentservice.dto.UserRole;
import com.scroogebank.crm.agentservice.dto.UsersListResponse;
import com.scroogebank.crm.agentservice.security.AuthenticatedUser;	
import com.scroogebank.crm.agentservice.security.ForbiddenException;
import org.springframework.stereotype.Service;

/**
 * Orchestrates user account operations backed by the user store.
 */
@Service
public class UserAccountService {
	private final InMemoryUserStore store;

	public UserAccountService(InMemoryUserStore store) {
		this.store = store;
	}

	/**
	 * Lists users with normalized paging parameters.
	 *
	 * @param limit requested page size
	 * @param offset requested offset
	 * @param role optional role filter
	 * @return paginated user list
	 */
	public UsersListResponse listUsers(int limit, int offset, String role) {
		int normalizedLimit = Math.max(1, Math.min(200, limit));
		int normalizedOffset = Math.max(0, offset);
		long total = store.countUsers(role);
		return new UsersListResponse(
			store.listUsers(normalizedLimit, normalizedOffset, role),
			new Pagination(normalizedLimit, normalizedOffset, total)
		);
	}

	/**
	 * Creates a new user account.
	 *
	 * @param request create user payload
	 * @return created user
	 */
	public UserDto createUser(CreateUserRequest request, UserRole role) {
		// Can't create super admin accounts via this endpoint
		if (request.role().equals(UserRole.super_admin)) {
			throw new IllegalArgumentException("Can't create super admin");
		}

		// Agents are not allowed to create admin users
		if (role == UserRole.agent && request.role() == UserRole.admin) {
			throw new ForbiddenException("Agent is not allowed to create admin");
		}

		// Delegate to the store when validation passes
		return store.createUser(request);
	}

	/**
	 * Fetches a user by id.
	 *
	 * @param userId API user identifier
	 * @return user DTO
	 */
	public UserDto getUser(String userId) {
		return store.getUser(userId);
	}

	/**
	 * Updates a user by id.
	 *
	 * @param userId API user identifier
	 * @param patch update payload
	 * @return updated user DTO
	 */
	public UserDto updateUser(String userId, UpdateUserRequest patch, AuthenticatedUser user) {
		// Agents can only update their own account
		if (user.isAgent() && !userId.equals(user.userId())) {
			throw new ForbiddenException("Agent is not allowed to update other users");
		}

		// Agents cannot promote anyone (including themselves) to admin or super admin
		if (user.isAgent() && (patch.role() == UserRole.admin || patch.role() == UserRole.super_admin)) {
			throw new ForbiddenException("Agent is not allowed to update role to admin or super_admin");
		}

		// Admins cannot promote anyone to super admin
		if (user.isAdmin() && patch.role() == UserRole.super_admin) {
			throw new ForbiddenException("Admin is not allowed to update role to super_admin");
		}

		// Delegate to the store when validation passes
		return store.updateUser(userId, patch);
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
		UserRole targetRole = target.role();

		// Agents can never delete admin or super_admin accounts
		if (user.isAgent() && (targetRole == UserRole.admin || targetRole == UserRole.super_admin)) {
			throw new ForbiddenException("Agent is not allowed to delete admin or super_admin");
		}

		// Admins cannot delete super_admin accounts
		if (user.isAdmin() && targetRole == UserRole.super_admin) {
			throw new ForbiddenException("Admin is not allowed to delete super_admin");
		}

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
		UserRole targetRole = target.role();

		// Agent can't disable anyone
		if (user.isAgent()) {
			throw new ForbiddenException("Agent is not allowed to disable any user");
		}		

		// Superadmin can't be disabled
		if (targetRole == UserRole.super_admin) {
			throw new ForbiddenException("Superadmin is not allowed to be disabled");
		}

		return store.disableUser(userId);
	}

	/**
	 * Resets the user's password and invalidates refresh tokens.
	 *
	 * @param userId API user identifier
	 * @param _request reset payload (currently unused)
	 */
	public void resetPassword(String userId, ResetPasswordRequest _request) {
		store.resetPassword(userId);
	}
}
