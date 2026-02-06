package com.itsa.crm.transactions_service.service;

import com.itsa.crm.transactions_service.api.Pagination;
import com.itsa.crm.transactions_service.dto.CreateUserRequest;
import com.itsa.crm.transactions_service.dto.ResetPasswordRequest;
import com.itsa.crm.transactions_service.dto.UpdateUserRequest;
import com.itsa.crm.transactions_service.dto.UserDto;
import com.itsa.crm.transactions_service.dto.UsersListResponse;

/**
 * Facade for user account operations backed by the in-memory store.
 */
public class UserAccountService {
	private final InMemoryUserStore store;

	public UserAccountService(InMemoryUserStore store) {
		this.store = store;
	}

	/**
	 * Lists users with pagination and role filtering.
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
	 * Creates a new user.
	 */
	public UserDto createUser(CreateUserRequest request) {
		return store.createUser(request);
	}

	/**
	 * Retrieves a user by id.
	 */
	public UserDto getUser(String userId) {
		return store.getUser(userId);
	}

	/**
	 * Updates a user by id.
	 */
	public UserDto updateUser(String userId, UpdateUserRequest patch) {
		return store.updateUser(userId, patch);
	}

	/**
	 * Deletes a user by id.
	 */
	public void deleteUser(String userId) {
		store.deleteUser(userId);
	}

	/**
	 * Disables a user by id.
	 */
	public UserDto disableUser(String userId) {
		return store.disableUser(userId);
	}

	/**
	 * Resets a user's password (request payload ignored for now).
	 */
	public void resetPassword(String userId, ResetPasswordRequest _request) {
		store.resetPassword(userId);
	}
}


