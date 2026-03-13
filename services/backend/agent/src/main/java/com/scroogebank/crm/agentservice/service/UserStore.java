package com.scroogebank.crm.agentservice.service;

import com.scroogebank.crm.agentservice.dto.CreateUserRequest;
import com.scroogebank.crm.agentservice.dto.UpdateUserRequest;
import com.scroogebank.crm.agentservice.dto.UserDto;
import java.util.List;

/**
 * Storage abstraction for user and refresh-token state.
 */
public interface UserStore {
	UserDto createUser(CreateUserRequest request);

	UserDto updateUser(String userId, UpdateUserRequest patch);

	void deleteUser(String userId);

	UserDto disableUser(String userId);

	void resetPassword(String userId);

	UserDto getUser(String userId);

	InMemoryUserStore.UserRecord findByEmail(String email);

	InMemoryUserStore.UserRecord loadRecord(String userId);

	List<UserDto> listUsers(int limit, int offset, String roleFilter);

	long countUsers(String roleFilter);

	String issueRefreshToken(String userId);

	String rotateRefreshToken(String oldToken);

	boolean isRefreshTokenValid(String token);

	String userIdForRefreshToken(String token);

	boolean verifyPassword(InMemoryUserStore.UserRecord record, String password);
}
