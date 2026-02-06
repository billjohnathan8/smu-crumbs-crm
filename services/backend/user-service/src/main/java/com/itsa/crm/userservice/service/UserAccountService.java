package com.itsa.crm.userservice.service;

import com.itsa.crm.userservice.api.Pagination;
import com.itsa.crm.userservice.dto.CreateUserRequest;
import com.itsa.crm.userservice.dto.ResetPasswordRequest;
import com.itsa.crm.userservice.dto.UpdateUserRequest;
import com.itsa.crm.userservice.dto.UserDto;
import com.itsa.crm.userservice.dto.UsersListResponse;
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
	public UserDto createUser(CreateUserRequest request) {
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
	public UserDto updateUser(String userId, UpdateUserRequest patch) {
		return store.updateUser(userId, patch);
	}

	/**
	 * Deletes a user by id.
	 *
	 * @param userId API user identifier
	 */
	public void deleteUser(String userId) {
		store.deleteUser(userId);
	}

	/**
	 * Disables a user by id.
	 *
	 * @param userId API user identifier
	 * @return updated user DTO
	 */
	public UserDto disableUser(String userId) {
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
