package com.itsa.crm.agentservice.controller;

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
import com.itsa.crm.agentservice.api.Pagination;
import com.itsa.crm.agentservice.dto.CreateUserRequest;
import com.itsa.crm.agentservice.dto.ResetPasswordRequest;
import com.itsa.crm.agentservice.dto.UpdateUserRequest;
import com.itsa.crm.agentservice.dto.UserDto;
import com.itsa.crm.agentservice.dto.UserRole;
import com.itsa.crm.agentservice.dto.UserStatus;
import com.itsa.crm.agentservice.dto.UsersListResponse;
import com.itsa.crm.agentservice.exception.ApiExceptionHandler;
import com.itsa.crm.agentservice.security.AuthenticatedUser;
import com.itsa.crm.agentservice.security.ForbiddenException;
import com.itsa.crm.agentservice.security.RequestAuth;
import com.itsa.crm.agentservice.service.UserAccountService;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.doNothing;

/**
 * Web-layer tests for {@link UserController}.
 */
class UserControllerTest {
    private MockMvc mockMvc;
    private UserAccountService userAccountService;
    private RequestAuth requestAuth;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        userAccountService = mock(UserAccountService.class);
        requestAuth = mock(RequestAuth.class);
        objectMapper = new ObjectMapper();

        mockMvc = MockMvcBuilders.standaloneSetup(new UserController(userAccountService, requestAuth))
            .setControllerAdvice(new ApiExceptionHandler())
            .build();
    }

    @Test
    void listUsers_agentForbidden() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_2", "agent"));

        mockMvc.perform(get("/api/agents").header("Authorization", "Bearer x"))
            .andExpect(status().isForbidden());
    }

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

    @Test
    void deleteUser_rootAdminForbidden() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
        org.mockito.Mockito.doThrow(new ForbiddenException("root_admin"))
            .when(userAccountService).deleteUser(eq("usr_1"));

        mockMvc.perform(delete("/api/agents/usr_1").header("Authorization", "Bearer x"))
            .andExpect(status().isForbidden());
    }

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
        when(userAccountService.createUser(any())).thenReturn(dto);

        mockMvc.perform(post("/api/agents")
                .header("Authorization", "Bearer x")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isCreated());
    }

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
        when(userAccountService.updateUser(eq("usr_3"), any())).thenReturn(dto);

        mockMvc.perform(put("/api/agents/usr_3")
                .header("Authorization", "Bearer x")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isOk());
    }

    @Test
    void deleteUser_adminNoContent() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));

        mockMvc.perform(delete("/api/agents/usr_3").header("Authorization", "Bearer x"))
            .andExpect(status().isNoContent());

        verify(userAccountService).deleteUser(eq("usr_3"));
    }

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
        when(userAccountService.disableUser(eq("usr_3"))).thenReturn(dto);

        mockMvc.perform(post("/api/agents/usr_3/disable").header("Authorization", "Bearer x"))
            .andExpect(status().isOk());
    }

    @Test
    void resetPassword_adminAccepted_withBody() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
        ResetPasswordRequest body = new ResetPasswordRequest("ava@example.com");
        doNothing().when(userAccountService).resetPassword(eq("usr_3"), any());

        mockMvc.perform(post("/api/agents/usr_3/reset-password")
                .header("Authorization", "Bearer x")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)))
            .andExpect(status().isAccepted());
    }

    @Test
    void resetPassword_adminAccepted_withoutBody() throws Exception {
        when(requestAuth.requireUser(any())).thenReturn(new AuthenticatedUser("usr_1", "admin"));
        doNothing().when(userAccountService).resetPassword(eq("usr_3"), eq(null));

        mockMvc.perform(post("/api/agents/usr_3/reset-password").header("Authorization", "Bearer x"))
            .andExpect(status().isAccepted());
    }
}
