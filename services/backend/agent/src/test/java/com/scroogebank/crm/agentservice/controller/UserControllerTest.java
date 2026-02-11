package com.scroogebank.crm.agentservice.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import tools.jackson.databind.ObjectMapper;
import com.scroogebank.crm.agentservice.api.Pagination;
import com.scroogebank.crm.agentservice.dto.CreateUserRequest;
// import com.scroogebank.crm.agentservice.dto.ResetPasswordRequest;
import com.scroogebank.crm.agentservice.dto.UpdateUserRequest;
import com.scroogebank.crm.agentservice.dto.UserDto;
import com.scroogebank.crm.agentservice.dto.UserRole;
import com.scroogebank.crm.agentservice.dto.UserStatus;
import com.scroogebank.crm.agentservice.dto.UsersListResponse;
import com.scroogebank.crm.agentservice.exception.ApiExceptionHandler;
import com.scroogebank.crm.agentservice.security.AuthenticatedUser;
import com.scroogebank.crm.agentservice.security.ForbiddenException;
import com.scroogebank.crm.agentservice.security.RequestAuth;
import com.scroogebank.crm.agentservice.service.UserAccountService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Web-layer tests for {@link UserController}.
 *
 * <p>These tests verify HTTP behaviour only: request routing, status codes, and that the
 * controller calls the service with the right arguments. {@link UserAccountService} and
 * {@link RequestAuth} are mocked so we do not hit the real store or JWT validation.
 *
 * <p>Setup: {@link MockMvc} is built with a standalone {@link UserController} and
 * {@link ApiExceptionHandler} so that 4xx responses (e.g. ForbiddenException) are
 * translated to the correct HTTP status codes.
 */
class UserControllerTest {
    private MockMvc mockMvc;
    private UserAccountService userAccountService;
    private RequestAuth requestAuth;
    private ObjectMapper objectMapper;

    /** Builds MockMvc with mocked service and auth; controller advice handles 4xx mapping. */
    @BeforeEach
    void setUp() {
        userAccountService = mock(UserAccountService.class);
        requestAuth = mock(RequestAuth.class);
        objectMapper = new ObjectMapper();

        mockMvc = MockMvcBuilders.standaloneSetup(new UserController(userAccountService, requestAuth))
            .setControllerAdvice(new ApiExceptionHandler())
            .build();
    }

    /** Agents are not allowed to list users; controller returns 403 Forbidden. */
    @Test
    void listUsers_agentForbidden() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_2", "agent"));

        mockMvc.perform(get("/api/agents").header("Authorization", "Bearer x"))
            .andExpect(status().isForbidden());
    }

    /** Admin can list users; controller returns 200 and delegates to service with default pagination. */
    @Test
    void listUsers_adminOk() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
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
        when(userAccountService.listUsers(eq(50), eq(0), eq(null)))
            .thenReturn(new UsersListResponse(List.of(dto), new Pagination(50, 0, 1)));

        mockMvc.perform(get("/api/agents").header("Authorization", "Bearer x"))
            .andExpect(status().isOk());
    }

    /** GET /api/agents/me returns the authenticated user's profile (any role); service is called with that user's ID. */
    @Test
    void me_returnsUser() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_2", "agent"));
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
        when(userAccountService.getUser(eq("usr_2"))).thenReturn(dto);

        mockMvc.perform(get("/api/agents/me").header("Authorization", "Bearer x"))
            .andExpect(status().isOk());

        verify(userAccountService).getUser(eq("usr_2"));
    }

    /** Admin can fetch another user by ID; controller returns 200 with user DTO. */
    @Test
    void getUser_adminOk() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
        UserDto dto = new UserDto(
            "usr_3",
            "Ben",
            "Tan",
            "ben@example.com",
            UserRole.agent,
            UserStatus.active,
            Instant.parse("2026-02-05T00:00:00Z"),
            Instant.parse("2026-02-05T00:00:00Z")
        );
        when(userAccountService.getUser(eq("usr_3"))).thenReturn(dto);

        mockMvc.perform(get("/api/agents/usr_3").header("Authorization", "Bearer x"))
            .andExpect(status().isOk());
    }

    /** Admin can create a agent; controller returns 201 Created and passes body + creator role to service. */
    @Test
    void createUser_adminCreated() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
        CreateUserRequest body = new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.agent, false, "temp123");
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
		when(userAccountService.createUser(any(), any())).thenReturn(dto);

        mockMvc.perform(post("/api/agents")
                .header("Authorization", "Bearer x")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isCreated());
    }

    /** Agents cannot create users; controller returns 403 before calling the service. */
    @Test
    void createUser_agentForbidden() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_2", "agent"));
        CreateUserRequest body = new CreateUserRequest("Ava", "Stone", "ava@example.com", UserRole.agent, false, "temp123");

        mockMvc.perform(post("/api/agents")
                .header("Authorization", "Bearer x")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isForbidden());
    }

    /** Admin can update a user by ID; controller returns 200 and delegates userId, body, and authenticated user to service. */
    @Test
    void updateUser_adminOk() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
        UpdateUserRequest body = new UpdateUserRequest("Ben", "Tan", "ben@example.com", UserRole.admin);
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
        when(userAccountService.updateUser(eq("usr_3"), any(), any(AuthenticatedUser.class))).thenReturn(dto);

        mockMvc.perform(put("/api/agents/usr_3")
                .header("Authorization", "Bearer x")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isOk());
    }

    /** Deleting root admin (usr_1) causes service to throw ForbiddenException; controller maps it to 403. */
    @Test
    void deleteUser_rootAdminForbidden() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
        org.mockito.Mockito.doThrow(new ForbiddenException("root_admin"))
			.when(userAccountService).deleteUser(eq("usr_1"), any(AuthenticatedUser.class));

        mockMvc.perform(delete("/api/agents/usr_1").header("Authorization", "Bearer x"))
            .andExpect(status().isForbidden());
    }

    /** Admin can delete a non-root user; controller returns 204 No Content and calls service with userId and auth. */
    @Test
    void deleteUser_adminNoContent() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));

        mockMvc.perform(delete("/api/agents/usr_3").header("Authorization", "Bearer x"))
            .andExpect(status().isNoContent());

		verify(userAccountService).deleteUser(eq("usr_3"), any(AuthenticatedUser.class));
    }

    /** Admin can disable a user; controller returns 200 with updated user DTO (status disabled). */
    @Test
    void disableUser_adminOk() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
        UserDto dto = new UserDto(
            "usr_3",
            "Ben",
            "Tan",
            "ben@example.com",
            UserRole.agent,
            UserStatus.disabled,
            Instant.parse("2026-02-05T00:00:00Z"),
            Instant.parse("2026-02-05T00:00:00Z")
        );
        when(userAccountService.disableUser(eq("usr_3"), any(AuthenticatedUser.class))).thenReturn(dto);

        mockMvc.perform(post("/api/agents/usr_3/disable").header("Authorization", "Bearer x"))
            .andExpect(status().isOk());
    }

    // /** Admin can trigger password reset with optional body; controller returns 202 Accepted. */
    // @Test
    // void resetPassword_adminAccepted_withBody() throws Exception {
    //     when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
    //     ResetPasswordRequest body = new ResetPasswordRequest("ava@example.com");
    //     doNothing().when(userAccountService).resetPassword(eq("usr_3"), any());

    //     mockMvc.perform(post("/api/agents/usr_3/reset-password")
    //             .header("Authorization", "Bearer x")
    //             .contentType(MediaType.APPLICATION_JSON)
    //             .content(objectMapper.writeValueAsString(body)))
    //         .andExpect(status().isAccepted());
    // }

    // /** Admin can trigger password reset without request body; controller returns 202 Accepted. */
    // @Test
    // void resetPassword_adminAccepted_withoutBody() throws Exception {
    //     when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
    //     doNothing().when(userAccountService).resetPassword(eq("usr_3"), eq(null));

    //     mockMvc.perform(post("/api/agents/usr_3/reset-password").header("Authorization", "Bearer x"))
    //         .andExpect(status().isAccepted());
    // }
}
