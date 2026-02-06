package com.itsa.crm.userservice.service;

import com.itsa.crm.userservice.api.Pagination;
import com.itsa.crm.userservice.dto.CreateUserRequest;
import com.itsa.crm.userservice.dto.ResetPasswordRequest;
import com.itsa.crm.userservice.dto.UpdateUserRequest;
import com.itsa.crm.userservice.dto.UserDto;
import com.itsa.crm.userservice.dto.UsersListResponse;
import org.springframework.stereotype.Service;

@Service
public class UserAccountService {
	private final InMemoryUserStore store;

	public UserAccountService(InMemoryUserStore store) {
		this.store = store;
	}

	public UsersListResponse listUsers(int limit, int offset, String role) {
		int normalizedLimit = Math.max(1, Math.min(200, limit));
		int normalizedOffset = Math.max(0, offset);
		long total = store.countUsers(role);
		return new UsersListResponse(
			store.listUsers(normalizedLimit, normalizedOffset, role),
			new Pagination(normalizedLimit, normalizedOffset, total)
		);
	}

	public UserDto createUser(CreateUserRequest request) {
		return store.createUser(request);
	}

	public UserDto getUser(String userId) {
		return store.getUser(userId);
	}

	public UserDto updateUser(String userId, UpdateUserRequest patch) {
		return store.updateUser(userId, patch);
	}

	public void deleteUser(String userId) {
		store.deleteUser(userId);
	}

	public UserDto disableUser(String userId) {
		return store.disableUser(userId);
	}

	public void resetPassword(String userId, ResetPasswordRequest _request) {
		store.resetPassword(userId);
	}
}

