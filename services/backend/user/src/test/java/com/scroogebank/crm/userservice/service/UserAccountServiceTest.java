package com.scroogebank.crm.userservice.service;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.userservice.api.Pagination;
import com.scroogebank.crm.userservice.dto.CreateUserRequest;
import com.scroogebank.crm.userservice.dto.ResetPasswordRequest;
import com.scroogebank.crm.userservice.dto.UpdateUserRequest;
import com.scroogebank.crm.userservice.dto.UserDto;
import com.scroogebank.crm.userservice.dto.UserRole;
import com.scroogebank.crm.userservice.dto.UserStatus;
import com.scroogebank.crm.userservice.dto.UsersListResponse;
import com.scroogebank.crm.userservice.exception.AccessDeniedException;
import com.scroogebank.crm.userservice.exception.UserNotFoundException;
import com.scroogebank.crm.userservice.security.AuthenticatedUser;


/**
 * Unit tests for {@link UserAccountService}.
 */
class UserAccountServiceTest {
	private PersistentUserStore store;
	private UserAccountService service;

	@BeforeEach
	void setUp() {
		store = mock(PersistentUserStore.class);
		service = new UserAccountService(store);
	}

	@Test
	void delegatesToStore() {
		UserDto dto = new UserDto(
			"usr_2",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.user,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		CreateUserRequest create = new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.user, false, "pw");
		UpdateUserRequest update = new UpdateUserRequest("Ava", "Stone", null, UserRole.user);
		ResetPasswordRequest reset = new ResetPasswordRequest("ava@example.com");

		when(store.createUser(eq(create))).thenReturn(dto);
		when(store.getUser(eq("usr_2"))).thenReturn(dto);
		when(store.updateUser(eq("usr_2"), eq(update))).thenReturn(dto);
		when(store.disableUser(eq("usr_2"))).thenReturn(dto);

		assertEquals(dto, service.createUser(create, requester));
		assertEquals(dto, service.getUser("usr_2", requester));
		assertEquals(dto, service.updateUser("usr_2", update, requester));
		service.deleteUser("usr_2", requester);
		assertEquals(dto, service.disableUser("usr_2", requester));
		service.resetPassword("usr_2", reset, requester);

		verify(store).deleteUser(eq("usr_2"));
		verify(store).resetPassword(eq("usr_2"));
	}

	@Test
	void resetPassword_selfTarget_rejected() {
		UserDto self = new UserDto(
			"usr_2",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.user,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		AuthenticatedUser requester = new AuthenticatedUser("usr_2", "user");
		when(store.getUser("usr_2")).thenReturn(self);

		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () ->
			service.resetPassword("usr_2", null, requester)
		);
		assertEquals("self_reset_not_supported_use_forgot_password", denied.getMessage());
		verify(store, never()).resetPassword(any());
	}

	//  CREATE USER TESTS  //
	//  ─── Happy Path ───
	@ParameterizedTest
	@CsvSource({
		"super_admin, admin",
		"super_admin, user",
		"admin, user"
	})
	void user_canCreateUsers(String requesterRole, String targetRole) {
		AuthenticatedUser requester = userWithRole(UserRole.fromWireValue(requesterRole));
		CreateUserRequest request = createRequest(UserRole.fromWireValue(targetRole));
		Instant now = Instant.now();

		when(store.createUser(any())).thenAnswer(inv -> {
			CreateUserRequest req = inv.getArgument(0);
			return new UserDto("usr_1", "Jane", "Smith", "jane@example.com", req.role(), UserStatus.active, now, now);
		});

		UserDto result = service.createUser(request, requester);

		assertEquals(result.role(), UserRole.fromWireValue(targetRole));
		assertEquals(result.status(), UserStatus.active);
		verify(store, times(1)).createUser(any());
	}
	
	//  ─── Permission Denied ───
	@ParameterizedTest
	@CsvSource({
		"super_admin, super_admin",
		"admin, super_admin",
		"admin, admin",
		"user, super_admin",
		"user, admin",
		"user, user"
	})
	void user_cannotCreateUsers(String requesterRole, String targetRole) {
		AuthenticatedUser requester = userWithRole(UserRole.fromWireValue(requesterRole));
		CreateUserRequest request = createRequest(UserRole.fromWireValue(targetRole));

		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () -> service.createUser(request, requester));
		assertNotNull(denied);

		// No call to store when validation fails
		verify(store, never()).createUser(any());
	}

	@Test
	void seededRootAdmin_canCreateAdminUser() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		CreateUserRequest request = createRequest(UserRole.admin);
		Instant now = Instant.now();

		when(store.createUser(any())).thenAnswer(inv -> {
			CreateUserRequest req = inv.getArgument(0);
			return new UserDto("usr_9", "Jane", "Smith", "jane@example.com", req.role(), UserStatus.active, now, now);
		});

		UserDto result = service.createUser(request, requester);

		assertEquals(UserRole.admin, result.role());
		verify(store, times(1)).createUser(any());
	}

	//  READ USER TESTS  //
	//  ─── Happy Path ───
	@ParameterizedTest
	@CsvSource({
		"super_admin, admin",
		"super_admin, user",
		"admin, user"
	})
	void user_canListUsers(String requesterRole, String targetRole) {
		AuthenticatedUser requester = userWithRole(UserRole.fromWireValue(requesterRole));
		UserDto dto = new UserDto(
			"usr_2",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.fromWireValue(targetRole),
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);

		when(store.countUsers(eq(targetRole))).thenReturn(10L);
		when(store.listUsers(eq(200), eq(0), eq(targetRole))).thenReturn(List.of(dto));

		UsersListResponse result = service.listUsers(999, 0, targetRole, requester);
		assertEquals(1, result.data().size());
	}
	
	//  ─── Permission Denied ───
	@ParameterizedTest
	@CsvSource({
		"super_admin, super_admin",
		"admin, super_admin",
		"admin, admin",
		"user, super_admin",
		"user, admin",
		"user, user"
	})
	void user_cannotListUsers(String requesterRole, String targetRole) {
		AuthenticatedUser requester = userWithRole(UserRole.fromWireValue(requesterRole));

		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () -> service.listUsers(50, 0, targetRole, requester));
		assertNotNull(denied);

		// No call to store when validation fails
		verify(store, never()).listUsers(anyInt(), anyInt(), any());
	}

	@Test
	void listUsers_normalizesLimitAndOffset() {
		UserDto dto = new UserDto(
			"usr_2",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.user,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.countUsers(eq("user"))).thenReturn(10L);
		when(store.listUsers(eq(200), eq(0), eq("user"))).thenReturn(List.of(dto));

		AuthenticatedUser requester = userWithRole(UserRole.admin);
		UsersListResponse response = service.listUsers(999, -5, "user", requester);

		assertEquals(1, response.data().size());
		assertEquals(new Pagination(200, 0, 10L), response.pagination());
	}

	//  UPDATE USER TESTS  //
	//  ─── Happy Path ───
	@ParameterizedTest
	@CsvSource({
		"super_admin, admin",
		"super_admin, user",
		"admin, user"
	})
	void updateUser_allowed(String requesterRole, String targetRole) {
		AuthenticatedUser requester = userWithRole(UserRole.fromWireValue(requesterRole));
		UserDto existingUser = existingUser(UserRole.fromWireValue(targetRole));
		UpdateUserRequest request = updateRequest(UserRole.fromWireValue(targetRole));

		when(store.getUser(existingUser.id())).thenReturn(existingUser);
		when(store.updateUser(any(), any())).thenReturn(existingUser);

		UserDto result = service.updateUser(existingUser.id(), request, requester);

		assertEquals(result.role(), UserRole.fromWireValue(targetRole));
		verify(store).updateUser(eq(existingUser.id()), eq(request));
	};

	//  ─── Permission Denied ───
	@ParameterizedTest
	@CsvSource({
		"super_admin, super_admin",
		"admin, super_admin",
		"admin, admin",
		"user, super_admin",
		"user, admin",
		"user, user"
	})
	void updateUser_notAllowed(String requesterRole, String targetRole) {
		AuthenticatedUser requester = userWithRole(UserRole.fromWireValue(requesterRole));
		UserDto existingUser = existingUser(UserRole.fromWireValue(targetRole));
		UpdateUserRequest request = updateRequest(UserRole.fromWireValue(targetRole));

		when(store.getUser(existingUser.id())).thenReturn(existingUser);

		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () -> service.updateUser(existingUser.id(), request, requester));
		assertNotNull(denied);

		verify(store, never()).updateUser(any(), any());
	}

	//  ─── User Not Found ───
	@Test
	void updateUser_shouldThrow_whenUserNotFound() {
		AuthenticatedUser requester = userWithRole(UserRole.super_admin);
		String userId = "nonexistent-user-id";

		UpdateUserRequest request = updateRequest(UserRole.admin);

		when(store.getUser(userId)).thenReturn(null);

		UserNotFoundException notFound = assertThrows(UserNotFoundException.class, () -> service.updateUser(userId, request, requester));
		assertNotNull(notFound);
		verify(store, never()).updateUser(any(), any());
	}

	//  ─── Field Mapping ───
	@Test
	void updateUser_shouldMapAllFieldsCorrectly() {
		AuthenticatedUser requester = userWithRole(UserRole.super_admin);
		UserDto existingUser = existingUser(UserRole.user);

		UpdateUserRequest request = new UpdateUserRequest(
				"Jane",
				"Smith",
				"jane@example.com",
				UserRole.admin
		);
		UserDto updatedUser = new UserDto(
			existingUser.id(),
			"Jane",
			"Smith",
			"jane@example.com",
			UserRole.admin,
			UserStatus.active,
			existingUser.createdAt(),
			existingUser.updatedAt()
		);


		when(store.getUser(existingUser.id())).thenReturn(existingUser);
		when(store.updateUser(any(), any())).thenReturn(updatedUser);

		UserDto result = service.updateUser(existingUser.id(), request, requester);

		assertEquals(result.firstName(), "Jane");
		assertEquals(result.lastName(), "Smith");
		assertEquals(result.email(), "jane@example.com");
		assertEquals(result.role(), UserRole.admin);

		verify(store).updateUser(eq(existingUser.id()), eq(request));
	}


	@Test
	void deleteUser_agentCannotDeleteAdminOrSuperAdmin() {
		UserDto adminDto = new UserDto(
			"usr_3",
			"Ben",
			"Tan",
			"ben@example.com",
			UserRole.admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser(eq("usr_3"))).thenReturn(adminDto);

		AuthenticatedUser user = new AuthenticatedUser("usr_2", "user");

		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () -> service.deleteUser("usr_3", user));
		assertNotNull(denied);

		verify(store).getUser(eq("usr_3"));
		verify(store, never()).deleteUser(eq("usr_3"));
	}

	@Test
	void deleteUser_superAdminDeleteAdminAndAgent() {
		UserDto adminDto = new UserDto(
			"usr_3",
			"Ben",
			"Tan",
			"ben@example.com",
			UserRole.admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		UserDto userDto = new UserDto(
			"usr_4",
			"Chris",
			"Lee",
			"chris@example.com",
			UserRole.user,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser(eq("usr_3"))).thenReturn(adminDto);
		when(store.getUser(eq("usr_4"))).thenReturn(userDto);

		AuthenticatedUser superAdmin = new AuthenticatedUser("usr_1", "super_admin");

		service.deleteUser("usr_3", superAdmin);
		service.deleteUser("usr_4", superAdmin);

		verify(store).getUser(eq("usr_3"));
		verify(store).getUser(eq("usr_4"));
		verify(store).deleteUser(eq("usr_3"));
		verify(store).deleteUser(eq("usr_4"));
	}

	@Test
	void deleteUser_adminDeleteAgent() {
		UserDto userDto = new UserDto(
			"usr_3",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.user,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser(eq("usr_3"))).thenReturn(userDto);

		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "admin");

		service.deleteUser("usr_3", admin);

		verify(store).getUser(eq("usr_3"));
		verify(store).deleteUser(eq("usr_3"));
	}

	@Test
	void deleteUser_adminCannotDeleteSuperAdmin() {
		UserDto superAdminDto = new UserDto(
			"usr_4",
			"Root",
			"Admin",
			"root2@example.com",
			UserRole.super_admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser(eq("usr_4"))).thenReturn(superAdminDto);

		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "admin");

		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () -> service.deleteUser("usr_4", admin));
		assertNotNull(denied);

		verify(store).getUser(eq("usr_4"));
		verify(store, never()).deleteUser(eq("usr_4"));
	}

	// ─── Helpers ───
	private AuthenticatedUser userWithRole(UserRole role) {
		return new AuthenticatedUser("usr_2", role);
	}

	private CreateUserRequest createRequest(UserRole role) {
        return new CreateUserRequest("Jane", "Smith", "jane@example.com", role, false, "pw");
    }

	private UpdateUserRequest updateRequest(UserRole role) {
		return new UpdateUserRequest("Jane", "Smith", "jane@example.com", role);
	}

	private UserDto existingUser(UserRole role) {
		return new UserDto(
			"usr_3",
			"Existing",
			"User",
			"existing.user@example.com",
			role,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
	}
}
