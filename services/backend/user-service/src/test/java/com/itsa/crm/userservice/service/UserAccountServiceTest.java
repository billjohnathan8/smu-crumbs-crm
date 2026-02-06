package com.itsa.crm.userservice.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.itsa.crm.userservice.api.Pagination;
import com.itsa.crm.userservice.dto.CreateUserRequest;
import com.itsa.crm.userservice.dto.ResetPasswordRequest;
import com.itsa.crm.userservice.dto.UpdateUserRequest;
import com.itsa.crm.userservice.dto.UserDto;
import com.itsa.crm.userservice.dto.UserRole;
import com.itsa.crm.userservice.dto.UserStatus;
import com.itsa.crm.userservice.dto.UsersListResponse;
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
		ResetPasswordRequest reset = new ResetPasswordRequest("ava@example.com");

		when(store.createUser(eq(create))).thenReturn(dto);
		when(store.getUser(eq("usr_2"))).thenReturn(dto);
		when(store.updateUser(eq("usr_2"), eq(update))).thenReturn(dto);
		when(store.disableUser(eq("usr_2"))).thenReturn(dto);

		assertEquals(dto, service.createUser(create));
		assertEquals(dto, service.getUser("usr_2"));
		assertEquals(dto, service.updateUser("usr_2", update));
		service.deleteUser("usr_2");
		assertEquals(dto, service.disableUser("usr_2"));
		service.resetPassword("usr_2", reset);

		verify(store).deleteUser(eq("usr_2"));
		verify(store).resetPassword(eq("usr_2"));
	}
}
