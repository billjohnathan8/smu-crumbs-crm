package com.scroogebank.crm.agentservice.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.agentservice.api.Pagination;
import com.scroogebank.crm.agentservice.dto.CreateUserRequest;
import com.scroogebank.crm.agentservice.dto.ResetPasswordRequest;
import com.scroogebank.crm.agentservice.dto.UpdateUserRequest;
import com.scroogebank.crm.agentservice.dto.UserDto;
import com.scroogebank.crm.agentservice.dto.UserRole;
import com.scroogebank.crm.agentservice.dto.UserStatus;
import com.scroogebank.crm.agentservice.dto.UsersListResponse;
import com.scroogebank.crm.agentservice.security.AuthenticatedUser;
import com.scroogebank.crm.agentservice.security.ForbiddenException;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * Unit tests for {@link UserAccountService}.
 */
class UserAccountServiceTest {
	private InMemoryUserStore store;
	private UserAccountService service;

	@BeforeEach
	void setUp() {
		store = mock(InMemoryUserStore.class);
		service = new UserAccountService(store);
	}

	@Test
	void listUsers_normalizesLimitAndOffset() {
		UserDto dto = new UserDto(
			"usr_2",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.agent,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.countUsers(eq("agent"))).thenReturn(10L);
		when(store.listUsers(eq(200), eq(0), eq("agent"))).thenReturn(List.of(dto));

		UsersListResponse response = service.listUsers(999, -5, "agent");

		assertEquals(1, response.data().size());
		assertEquals(new Pagination(200, 0, 10L), response.pagination());
	}

	@Test
	void delegatesToStore() {
		UserDto dto = new UserDto(
			"usr_2",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.agent,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		CreateUserRequest create = new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.agent, false, "pw");
		UpdateUserRequest update = new UpdateUserRequest("Ava", "Stone", null, null);
		// ResetPasswordRequest reset = new ResetPasswordRequest("ava@example.com");

		when(store.createUser(eq(create))).thenReturn(dto);
		when(store.getUser(eq("usr_2"))).thenReturn(dto);
		when(store.updateUser(eq("usr_2"), eq(update))).thenReturn(dto);
		when(store.disableUser(eq("usr_2"))).thenReturn(dto);

		assertEquals(dto, service.createUser(create, UserRole.admin));
		assertEquals(dto, service.getUser("usr_2"));
		assertEquals(dto, service.updateUser("usr_2", update, new AuthenticatedUser("usr_1", "admin")));
		service.deleteUser("usr_2", new AuthenticatedUser("usr_1", "admin"));
		assertEquals(dto, service.disableUser("usr_2", new AuthenticatedUser("usr_1", "admin")));
		// service.resetPassword("usr_2", reset);

		verify(store).deleteUser(eq("usr_2"));
		// verify(store).resetPassword(eq("usr_2"));
	}

	@Test
	void createUser_superAdminCreateAdmin() {
		CreateUserRequest create = new CreateUserRequest("Ben", "Tan", "ben@example.com", UserRole.admin, false, "pw");
		UserDto dto = new UserDto(
			"usr_3",
			"Ben",
			"Tan",
			"ben@example.com",
			UserRole.admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.createUser(eq(create))).thenReturn(dto);

		UserDto result = service.createUser(create, UserRole.super_admin);

		assertEquals(dto, result);
		verify(store).createUser(eq(create));
	}

	@Test
	void createUser_adminCreateAgent() {
		CreateUserRequest create = new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.agent, false, "pw");
		UserDto dto = new UserDto(
			"usr_2",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.agent,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.createUser(eq(create))).thenReturn(dto);

		UserDto result = service.createUser(create, UserRole.admin);

		assertEquals(dto, result);
		verify(store).createUser(eq(create));
	}

	@Test
	void createUser_cannotCreateSuperAdmin() {
		CreateUserRequest create = new CreateUserRequest("Root", "Admin", "root2@example.com", UserRole.super_admin, false, "pw");

		assertThrows(IllegalArgumentException.class, () -> service.createUser(create, UserRole.admin));

		// No call to store when validation fails
		verify(store, never()).createUser(eq(create));
	}

	@Test
	void createUser_agentCannotCreateAdmin() {
		CreateUserRequest create = new CreateUserRequest("Ben", "Tan", "ben@example.com", UserRole.admin, false, "pw");

		assertThrows(ForbiddenException.class, () -> service.createUser(create, UserRole.agent));

		verify(store, never()).createUser(eq(create));
	}

	@Test
	void updateUser_superAdminUpdateAdmin() {
		UpdateUserRequest patch = new UpdateUserRequest("Ben", "Tan", "ben@example.com", UserRole.admin);
		UserDto dto = new UserDto(
			"usr_3",
			"Ben",
			"Tan",
			"ben@example.com",
			UserRole.admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.updateUser(eq("usr_3"), eq(patch))).thenReturn(dto);

		AuthenticatedUser superAdmin = new AuthenticatedUser("usr_1", "super_admin");
		UserDto result = service.updateUser("usr_3", patch, superAdmin);

		assertEquals(dto, result);
		verify(store).updateUser(eq("usr_3"), eq(patch));
	}

	@Test
	void updateUser_adminUpdateAgent() {
		UpdateUserRequest patch = new UpdateUserRequest("Ava", "Stone", "ava@example.com", UserRole.admin);
		UserDto dto = new UserDto(
			"usr_2",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.updateUser(eq("usr_2"), eq(patch))).thenReturn(dto);

		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "admin");
		UserDto result = service.updateUser("usr_2", patch, admin);

		assertEquals(dto, result);
		verify(store).updateUser(eq("usr_2"), eq(patch));
	}

	@Test
	void updateUser_agentCanOnlyUpdateSelf() {
		UpdateUserRequest patch = new UpdateUserRequest("Ava", "Stone", "ava@example.com", UserRole.agent);
		AuthenticatedUser agent = new AuthenticatedUser("usr_2", "agent");

		assertThrows(ForbiddenException.class, () -> service.updateUser("usr_3", patch, agent));

		verify(store, never()).updateUser(eq("usr_3"), eq(patch));
	}

	@Test
	void updateUser_agentCannotPromoteToAdminOrSuperAdmin() {
		UpdateUserRequest promoteToAdmin = new UpdateUserRequest("Ava", "Stone", "ava@example.com", UserRole.admin);
		UpdateUserRequest promoteToSuperAdmin = new UpdateUserRequest("Ava", "Stone", "ava@example.com", UserRole.super_admin);
		AuthenticatedUser agent = new AuthenticatedUser("usr_2", "agent");

		assertThrows(ForbiddenException.class, () -> service.updateUser("usr_2", promoteToAdmin, agent));
		assertThrows(ForbiddenException.class, () -> service.updateUser("usr_2", promoteToSuperAdmin, agent));

		verify(store, never()).updateUser(eq("usr_2"), eq(promoteToAdmin));
		verify(store, never()).updateUser(eq("usr_2"), eq(promoteToSuperAdmin));
	}

	@Test
	void updateUser_adminCannotPromoteToSuperAdmin() {
		UpdateUserRequest promoteToSuperAdmin = new UpdateUserRequest("Ava", "Stone", "ava@example.com", UserRole.super_admin);
		AuthenticatedUser admin = new AuthenticatedUser("usr_1", "admin");

		assertThrows(ForbiddenException.class, () -> service.updateUser("usr_2", promoteToSuperAdmin, admin));

		verify(store, never()).updateUser(eq("usr_2"), eq(promoteToSuperAdmin));
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

		AuthenticatedUser agent = new AuthenticatedUser("usr_2", "agent");

		assertThrows(ForbiddenException.class, () -> service.deleteUser("usr_3", agent));

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
		UserDto agentDto = new UserDto(
			"usr_4",
			"Chris",
			"Lee",
			"chris@example.com",
			UserRole.agent,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser(eq("usr_3"))).thenReturn(adminDto);
		when(store.getUser(eq("usr_4"))).thenReturn(agentDto);

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
		UserDto agentDto = new UserDto(
			"usr_3",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.agent,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser(eq("usr_3"))).thenReturn(agentDto);

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

		assertThrows(ForbiddenException.class, () -> service.deleteUser("usr_4", admin));

		verify(store).getUser(eq("usr_4"));
		verify(store, never()).deleteUser(eq("usr_4"));
	}
}
