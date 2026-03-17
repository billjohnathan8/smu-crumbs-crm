package com.scroogebank.crm.agentservice;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.scroogebank.crm.agentservice.service.PersistentUserStore;

import jakarta.transaction.Transactional;

import com.scroogebank.crm.agentservice.dto.UserDto;
import com.scroogebank.crm.agentservice.dto.UserRole;
import com.scroogebank.crm.agentservice.dto.UserStatus;

/**
 * Verifies that the Spring application context loads.
 */

@SpringBootTest
class AgentServiceApplicationTests {

	@Autowired
    private PersistentUserStore store;

	@Test
	void contextLoads() {}
	
	@Test
	@Transactional
	void superAdmin_isSeededWithIdZero() {
		UserDto user = store.getUser("usr_0");
        assertNotNull(user);
        assertEquals(UserRole.super_admin, user.role());
        assertEquals(UserStatus.active, user.status());
	}
}


