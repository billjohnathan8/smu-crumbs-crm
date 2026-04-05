package com.scroogebank.crm.user_service.service;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.ArgumentCaptor;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.user_service.api.Pagination;
import com.scroogebank.crm.user_service.dto.CreateUserRequest;
import com.scroogebank.crm.user_service.dto.ResetPasswordRequest;
import com.scroogebank.crm.user_service.dto.UpdateUserRequest;
import com.scroogebank.crm.user_service.dto.UserDto;
import com.scroogebank.crm.user_service.dto.UserRole;
import com.scroogebank.crm.user_service.dto.UserStatus;
import com.scroogebank.crm.user_service.dto.UsersListResponse;
import com.scroogebank.crm.user_service.exception.AccessDeniedException;
import com.scroogebank.crm.user_service.exception.ArchivePreconditionFailedException;
import com.scroogebank.crm.user_service.exception.UserNotFoundException;
import com.scroogebank.crm.user_service.logging.UserAuditLogger;
import com.scroogebank.crm.user_service.security.AuthenticatedUser;


/**
 * Unit tests for {@link UserAccountService}.
 */
class UserAccountServiceTest {
	private static final String AUTH_HEADER = "Bearer test-token";
	private static final String CORRELATION_ID = "test-correlation-id";

	private final PersistentUserStore store = mock(PersistentUserStore.class);
	private final UserAuditLogger auditLogger = mock(UserAuditLogger.class);
	private final AssignedClientCounter assignedClientCounter = mock(AssignedClientCounter.class);
	private UserAccountService service = createService();

	private UserAccountService createService() {
		when(assignedClientCounter.countAssignedClients(any(), any(), any())).thenReturn(0L);
		return new UserAccountService(store, auditLogger, null, "local", assignedClientCounter);
	}

	@Test
	void delegatesToStore() {
		UserDto dto = new UserDto(
			"usr_2",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.user,
			UserStatus.disabled,
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

		assertEquals(dto, service.createUser(create, requester, AUTH_HEADER, CORRELATION_ID));
		assertEquals(dto, service.getUser("usr_2", requester));
		assertEquals(dto, service.updateUser("usr_2", update, requester, AUTH_HEADER, CORRELATION_ID));
		service.deleteUser("usr_2", requester, AUTH_HEADER, CORRELATION_ID, null);
		assertEquals(dto, service.disableUser("usr_2", requester, AUTH_HEADER, CORRELATION_ID));
		service.resetPassword("usr_2", reset, requester);

		verify(store).archiveUser(eq("usr_2"), eq("usr_1"), eq(null));
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

		UserDto result = service.createUser(request, requester, AUTH_HEADER, CORRELATION_ID);

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

		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () -> service.createUser(request, requester, AUTH_HEADER, CORRELATION_ID));
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

		UserDto result = service.createUser(request, requester, AUTH_HEADER, CORRELATION_ID);

		assertEquals(UserRole.admin, result.role());
		verify(store, times(1)).createUser(any());
	}

	@Test
	void createUser_cognitoMode_withoutTemporaryPassword_generatesOneSharedPassword() {
		CognitoService cognitoService = mock(CognitoService.class);
		service = new UserAccountService(store, auditLogger, cognitoService, "cognito");
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		CreateUserRequest request = new CreateUserRequest(
			"Jane",
			"Smith",
			"jane@example.com",
			UserRole.admin,
			true,
			null
		);
		Instant now = Instant.parse("2026-04-03T00:00:00Z");
		when(store.createUser(any())).thenReturn(new UserDto(
			"usr_9",
			"Jane",
			"Smith",
			"jane@example.com",
			UserRole.admin,
			UserStatus.active,
			now,
			now
		));

		service.createUser(request, requester, AUTH_HEADER, CORRELATION_ID);

		ArgumentCaptor<CreateUserRequest> storeRequestCaptor = ArgumentCaptor.forClass(CreateUserRequest.class);
		verify(store).createUser(storeRequestCaptor.capture());
		CreateUserRequest storeRequest = storeRequestCaptor.getValue();
		assertNotNull(storeRequest.temporaryPassword());
		assertTrue(!storeRequest.temporaryPassword().isBlank());
		assertEquals(16, storeRequest.temporaryPassword().length());
		assertTrue(storeRequest.temporaryPassword().chars().anyMatch(Character::isUpperCase));
		assertTrue(storeRequest.temporaryPassword().chars().anyMatch(Character::isLowerCase));
		assertTrue(storeRequest.temporaryPassword().chars().anyMatch(Character::isDigit));
		assertTrue(storeRequest.temporaryPassword().chars().anyMatch(ch -> "!@#$%&*?".indexOf(ch) >= 0));

		verify(cognitoService).createUser(
			eq("jane@example.com"),
			eq("Jane Smith"),
			eq("ADMIN"),
			eq(storeRequest.temporaryPassword()),
			eq(true)
		);
	}

	@Test
	void createUser_cognitoMode_withTemporaryPassword_usesProvidedPassword() {
		CognitoService cognitoService = mock(CognitoService.class);
		service = new UserAccountService(store, auditLogger, cognitoService, "cognito");
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		CreateUserRequest request = new CreateUserRequest(
			"Jane",
			"Smith",
			"jane@example.com",
			UserRole.admin,
			true,
			"Tmp!1234Abcd"
		);
		Instant now = Instant.parse("2026-04-03T00:00:00Z");
		when(store.createUser(any())).thenReturn(new UserDto(
			"usr_9",
			"Jane",
			"Smith",
			"jane@example.com",
			UserRole.admin,
			UserStatus.active,
			now,
			now
		));

		service.createUser(request, requester, AUTH_HEADER, CORRELATION_ID);

		verify(store).createUser(eq(request));
		verify(cognitoService).createUser(
			eq("jane@example.com"),
			eq("Jane Smith"),
			eq("ADMIN"),
			eq("Tmp!1234Abcd"),
			eq(true)
		);
	}

	@Test
	void createUser_cognitoMode_sendInviteDisabled_passesFalseToCognito() {
		CognitoService cognitoService = mock(CognitoService.class);
		service = new UserAccountService(store, auditLogger, cognitoService, "cognito");
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		CreateUserRequest request = new CreateUserRequest(
			"Jane",
			"Smith",
			"jane@example.com",
			UserRole.user,
			false,
			"Tmp!1234Abcd"
		);
		Instant now = Instant.parse("2026-04-03T00:00:00Z");
		when(store.createUser(any())).thenReturn(new UserDto(
			"usr_9",
			"Jane",
			"Smith",
			"jane@example.com",
			UserRole.user,
			UserStatus.active,
			now,
			now
		));

		service.createUser(request, requester, AUTH_HEADER, CORRELATION_ID);

		verify(cognitoService).createUser(
			eq("jane@example.com"),
			eq("Jane Smith"),
			eq("USER"),
			eq("Tmp!1234Abcd"),
			eq(false)
		);
	}

	//  READ USER TESTS  //
	//  ─── Happy Path ───
	@ParameterizedTest
	@CsvSource({
		"super_admin, super_admin",
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

	@Test
	void listUsers_rootAdminCanListAllWithoutRoleFilter() {
		UserDto dto = existingUser(UserRole.user);
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		when(store.countUsers(eq(null))).thenReturn(1L);
		when(store.listUsers(eq(50), eq(0), eq(null))).thenReturn(List.of(dto));

		UsersListResponse response = service.listUsers(50, 0, null, requester);

		assertEquals(1, response.data().size());
		verify(store).countUsers(eq(null));
		verify(store).listUsers(eq(50), eq(0), eq(null));
	}

	@Test
	void listUsers_seededRootAdminCanListSuperAdminsWithRoleFilter() {
		UserDto dto = existingUser(UserRole.super_admin);
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		when(store.countUsers(eq("super_admin"))).thenReturn(1L);
		when(store.listUsers(eq(50), eq(0), eq("super_admin"))).thenReturn(List.of(dto));

		UsersListResponse response = service.listUsers(50, 0, "super_admin", requester);

		assertEquals(1, response.data().size());
		verify(store).countUsers(eq("super_admin"));
		verify(store).listUsers(eq(50), eq(0), eq("super_admin"));
	}

	@Test
	void listUsers_nonRootAdminCannotListAllWithoutRoleFilter() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_2", "admin");

		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.listUsers(50, 0, null, requester)
		);
		assertNotNull(denied);
		verify(store, never()).countUsers(any());
		verify(store, never()).listUsers(anyInt(), anyInt(), any());
	}

	@Test
	void listUsers_nonRootAdminCannotListSuperAdmins() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_2", "admin");

		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.listUsers(50, 0, "super_admin", requester)
		);
		assertNotNull(denied);
		verify(store, never()).countUsers(any());
		verify(store, never()).listUsers(anyInt(), anyInt(), any());
	}

	@Test
	void getUser_deletedUserIsNotFound() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		UserDto deletedUser = new UserDto(
			"usr_3",
			"Deleted",
			"User",
			"deleted.user@example.com",
			UserRole.user,
			UserStatus.deleted,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser("usr_3")).thenReturn(deletedUser);

		UserNotFoundException notFound = assertThrows(
			UserNotFoundException.class,
			() -> service.getUser("usr_3", requester)
		);
		assertNotNull(notFound);
	}

	@Test
	void getUser_deletedUserCanBeFetchedWhenIncludeArchivedTrue() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		UserDto deletedUser = new UserDto(
			"usr_3",
			"Deleted",
			"User",
			"deleted.user@example.com",
			UserRole.user,
			UserStatus.deleted,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser("usr_3")).thenReturn(deletedUser);

		UserDto result = service.getUser("usr_3", requester, true);

		assertEquals("usr_3", result.id());
		assertEquals(UserStatus.deleted, result.status());
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

		UserDto result = service.updateUser(existingUser.id(), request, requester, AUTH_HEADER, CORRELATION_ID);

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

		AccessDeniedException denied = assertThrows(AccessDeniedException.class, () -> service.updateUser(existingUser.id(), request, requester, AUTH_HEADER, CORRELATION_ID));
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

		UserNotFoundException notFound = assertThrows(UserNotFoundException.class, () -> service.updateUser(userId, request, requester, AUTH_HEADER, CORRELATION_ID));
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

		UserDto result = service.updateUser(existingUser.id(), request, requester, AUTH_HEADER, CORRELATION_ID);

		assertEquals(result.firstName(), "Jane");
		assertEquals(result.lastName(), "Smith");
		assertEquals(result.email(), "jane@example.com");
		assertEquals(result.role(), UserRole.admin);

		verify(store).updateUser(eq(existingUser.id()), eq(request));
	}

	@Test
	void updateUser_nonRootAdminCannotUpdateAdminWhenRoleOmitted() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_2", "admin");
		UserDto existingAdmin = existingUser(UserRole.admin);
		UpdateUserRequest request = new UpdateUserRequest("Jane", null, null, null);

		when(store.getUser(existingAdmin.id())).thenReturn(existingAdmin);

		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.updateUser(existingAdmin.id(), request, requester, AUTH_HEADER, CORRELATION_ID)
		);
		assertNotNull(denied);
		verify(store, never()).updateUser(any(), any());
	}

	@Test
	void updateUser_rootAdminCanUpdateAdminWhenRoleOmitted() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		UserDto existingAdmin = existingUser(UserRole.admin);
		UpdateUserRequest request = new UpdateUserRequest("Jane", null, null, null);
		UserDto updated = new UserDto(
			existingAdmin.id(),
			"Jane",
			existingAdmin.lastName(),
			existingAdmin.email(),
			existingAdmin.role(),
			existingAdmin.status(),
			existingAdmin.createdAt(),
			existingAdmin.updatedAt()
		);

		when(store.getUser(existingAdmin.id())).thenReturn(existingAdmin);
		when(store.updateUser(existingAdmin.id(), request)).thenReturn(updated);

		UserDto result = service.updateUser(existingAdmin.id(), request, requester, AUTH_HEADER, CORRELATION_ID);

		assertEquals("Jane", result.firstName());
		verify(store).updateUser(existingAdmin.id(), request);
	}

	@Test
	void updateUser_rootAdminAccountCannotBeUpdated() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		UserDto rootAdmin = new UserDto(
			"usr_1",
			"Root",
			"Admin",
			"admin@crm.com",
			UserRole.admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser("usr_1")).thenReturn(rootAdmin);

		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.updateUser("usr_1", new UpdateUserRequest("Root", "Admin", null, null), requester, AUTH_HEADER, CORRELATION_ID)
		);
		assertNotNull(denied);
		verify(store, never()).updateUser(any(), any());
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

		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.deleteUser("usr_3", user, AUTH_HEADER, CORRELATION_ID, null)
		);
		assertNotNull(denied);

		verify(store).getUser(eq("usr_3"));
		verify(store, never()).archiveUser(any(), any(), any());
	}

	@Test
	void deleteUser_superAdminDeleteAdminAndAgent() {
		UserDto adminDto = new UserDto(
			"usr_3",
			"Ben",
			"Tan",
			"ben@example.com",
			UserRole.admin,
			UserStatus.disabled,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		UserDto userDto = new UserDto(
			"usr_4",
			"Chris",
			"Lee",
			"chris@example.com",
			UserRole.user,
			UserStatus.disabled,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser(eq("usr_3"))).thenReturn(adminDto);
		when(store.getUser(eq("usr_4"))).thenReturn(userDto);

		AuthenticatedUser superAdmin = new AuthenticatedUser("usr_1", "super_admin");

		service.deleteUser("usr_3", superAdmin, AUTH_HEADER, CORRELATION_ID, null);
		service.deleteUser("usr_4", superAdmin, AUTH_HEADER, CORRELATION_ID, null);

		verify(store).getUser(eq("usr_3"));
		verify(store).getUser(eq("usr_4"));
		verify(store).archiveUser(eq("usr_3"), eq("usr_1"), eq(null));
		verify(store).archiveUser(eq("usr_4"), eq("usr_1"), eq(null));
	}

	@Test
	void deleteUser_rootAdminMustDisableBeforeArchive() {
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

		AuthenticatedUser rootAdmin = new AuthenticatedUser("usr_1", "admin");

		ArchivePreconditionFailedException denied = assertThrows(
			ArchivePreconditionFailedException.class,
			() -> service.deleteUser("usr_3", rootAdmin, AUTH_HEADER, CORRELATION_ID, null)
		);
		assertEquals("Disable the user before archiving.", denied.getMessage());
		verify(store, never()).archiveUser(any(), any(), any());
	}

	@Test
	void deleteUser_rootAdminMustTransferAssignedClientsBeforeArchive() {
		UserDto userDto = new UserDto(
			"usr_3",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.user,
			UserStatus.disabled,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser(eq("usr_3"))).thenReturn(userDto);
		when(assignedClientCounter.countAssignedClients(eq("usr_3"), eq(AUTH_HEADER), eq(CORRELATION_ID)))
			.thenReturn(2L);

		AuthenticatedUser rootAdmin = new AuthenticatedUser("usr_1", "admin");

		ArchivePreconditionFailedException denied = assertThrows(
			ArchivePreconditionFailedException.class,
			() -> service.deleteUser("usr_3", rootAdmin, AUTH_HEADER, CORRELATION_ID, null)
		);
		assertEquals("Transfer assigned clients before archiving.", denied.getMessage());
		verify(store, never()).archiveUser(any(), any(), any());
	}

	@Test
	void deleteUser_adminMustTransferAssignedClientsBeforeArchive() {
		UserDto userDto = new UserDto(
			"usr_3",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.user,
			UserStatus.disabled,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser(eq("usr_3"))).thenReturn(userDto);
		when(assignedClientCounter.countAssignedClients(eq("usr_3"), eq(AUTH_HEADER), eq(CORRELATION_ID)))
			.thenReturn(1L);

		AuthenticatedUser admin = new AuthenticatedUser("usr_9", "admin");

		ArchivePreconditionFailedException denied = assertThrows(
			ArchivePreconditionFailedException.class,
			() -> service.deleteUser("usr_3", admin, AUTH_HEADER, CORRELATION_ID, null)
		);
		assertEquals("Transfer assigned clients before archiving.", denied.getMessage());
		verify(store, never()).archiveUser(any(), any(), any());
	}

	@Test
	void deleteUser_adminCanArchiveDisabledAgent() {
		UserDto userDto = new UserDto(
			"usr_3",
			"Ava",
			"Stone",
			"ava@example.com",
			UserRole.user,
			UserStatus.disabled,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser(eq("usr_3"))).thenReturn(userDto);

		AuthenticatedUser admin = new AuthenticatedUser("usr_9", "admin");
		when(assignedClientCounter.countAssignedClients(eq("usr_3"), eq(AUTH_HEADER), eq(CORRELATION_ID)))
			.thenReturn(0L);

		service.deleteUser("usr_3", admin, AUTH_HEADER, CORRELATION_ID, null);

		verify(store).getUser(eq("usr_3"));
		verify(store).archiveUser(eq("usr_3"), eq("usr_9"), eq(null));
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

		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.deleteUser("usr_4", admin, AUTH_HEADER, CORRELATION_ID, null)
		);
		assertNotNull(denied);

		verify(store).getUser(eq("usr_4"));
		verify(store, never()).archiveUser(any(), any(), any());
	}

	@Test
	void deleteUser_rootAdminAccountCannotBeArchived() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		UserDto rootAdmin = new UserDto(
			"usr_1",
			"Root",
			"Admin",
			"admin@crm.com",
			UserRole.admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser("usr_1")).thenReturn(rootAdmin);

		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.deleteUser("usr_1", requester, AUTH_HEADER, CORRELATION_ID, null)
		);
		assertNotNull(denied);
		verify(store, never()).archiveUser(any(), any(), any());
	}

	@Test
	void reinstateUser_nonRootAdminForbidden() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_9", "admin");

		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.reinstateUser("usr_3", requester, AUTH_HEADER, CORRELATION_ID)
		);
		assertNotNull(denied);
		verify(store, never()).reinstateUser(any(), any());
	}

	@Test
	void reinstateUser_rootAdminCanReinstateArchivedUsers() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		UserDto archivedAdmin = new UserDto(
			"usr_3",
			"Archived",
			"Admin",
			"archived.admin@example.com",
			UserRole.admin,
			UserStatus.deleted,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		UserDto archivedAgent = new UserDto(
			"usr_4",
			"Archived",
			"Agent",
			"archived.agent@example.com",
			UserRole.user,
			UserStatus.deleted,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		UserDto reinstatedAdmin = new UserDto(
			"usr_3",
			"Archived",
			"Admin",
			"archived.admin@example.com",
			UserRole.admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-06T00:00:00Z")
		);
		UserDto reinstatedAgent = new UserDto(
			"usr_4",
			"Archived",
			"Agent",
			"archived.agent@example.com",
			UserRole.user,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-06T00:00:00Z")
		);
		when(store.getUser("usr_3")).thenReturn(archivedAdmin);
		when(store.getUser("usr_4")).thenReturn(archivedAgent);
		when(store.reinstateUser("usr_3", "usr_1")).thenReturn(reinstatedAdmin);
		when(store.reinstateUser("usr_4", "usr_1")).thenReturn(reinstatedAgent);

		assertEquals(reinstatedAdmin, service.reinstateUser("usr_3", requester, AUTH_HEADER, CORRELATION_ID));
		assertEquals(reinstatedAgent, service.reinstateUser("usr_4", requester, AUTH_HEADER, CORRELATION_ID));
		verify(store).reinstateUser("usr_3", "usr_1");
		verify(store).reinstateUser("usr_4", "usr_1");
	}

	@Test
	void listArchivedUsers_nonRootAdminForbidden() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_9", "admin");
		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.listArchivedUsers(50, 0, "user", requester)
		);
		assertNotNull(denied);
		verify(store, never()).countArchivedUsers(any(), any());
		verify(store, never()).listArchivedUsers(anyInt(), anyInt(), any(), any());
	}

	@Test
	void disableUser_rootAdminAccountCannotBeDisabled() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_1", "admin");
		UserDto rootAdmin = new UserDto(
			"usr_1",
			"Root",
			"Admin",
			"admin@crm.com",
			UserRole.admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser("usr_1")).thenReturn(rootAdmin);

		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.disableUser("usr_1", requester, AUTH_HEADER, CORRELATION_ID)
		);
		assertNotNull(denied);
		verify(store, never()).disableUser(any());
	}

	@Test
	void resetPassword_rootAdminAccountCannotBeResetViaAdminEndpoint() {
		AuthenticatedUser requester = new AuthenticatedUser("usr_9", "admin");
		UserDto rootAdmin = new UserDto(
			"usr_1",
			"Root",
			"Admin",
			"admin@crm.com",
			UserRole.admin,
			UserStatus.active,
			Instant.parse("2026-02-05T00:00:00Z"),
			Instant.parse("2026-02-05T00:00:00Z")
		);
		when(store.getUser("usr_1")).thenReturn(rootAdmin);

		AccessDeniedException denied = assertThrows(
			AccessDeniedException.class,
			() -> service.resetPassword("usr_1", new ResetPasswordRequest("admin@crm.com"), requester)
		);
		assertNotNull(denied);
		verify(store, never()).resetPassword(any());
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
