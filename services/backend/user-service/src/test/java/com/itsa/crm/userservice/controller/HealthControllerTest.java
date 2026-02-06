package com.itsa.crm.userservice.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/**
 * Web-layer tests for {@link HealthController}.
 */
class HealthControllerTest {
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new HealthController()).build();
    }

    @Test
    void health_returnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/health"))
            .andExpect(status().isOk());
    }

    @Test
    void usersHealth_returnsOk() throws Exception {
        mockMvc.perform(get("/api/v1/users/health"))
            .andExpect(status().isOk());
    }

    @Test
    void rootHealth_returnsOk() throws Exception {
        mockMvc.perform(get("/health"))
            .andExpect(status().isOk());
    }
}
