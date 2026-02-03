package com.itsa.crm.userservice.controller;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.itsa.crm.userservice.dto.UserDto;
import com.itsa.crm.userservice.service.UserService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class UserControllerTest {
    private MockMvc mockMvc;
    private UserService userService;

    @BeforeEach
    void setUp() {
        userService = mock(UserService.class);
        mockMvc = MockMvcBuilders.standaloneSetup(new UserController(userService)).build();
    }

    @Test
    void listUsers_returnsUsers() throws Exception {
        when(userService.listUsers()).thenReturn(List.of(new UserDto("1", "Ava", "Stone", "ava@example.com", "AGENT")));

        mockMvc.perform(get("/api/v1/users"))
            .andExpect(status().isOk())
            .andExpect(content().json("[{\"userId\":\"1\",\"firstName\":\"Ava\",\"lastName\":\"Stone\",\"email\":\"ava@example.com\",\"role\":\"AGENT\"}]"));
    }

    @Test
    void usersHealth_returnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/users/health"))
            .andExpect(status().isOk())
            .andExpect(content().json("{\"status\":\"ok\"}"));
    }
}