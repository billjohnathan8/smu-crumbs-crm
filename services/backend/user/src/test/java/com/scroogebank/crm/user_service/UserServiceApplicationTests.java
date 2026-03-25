package com.scroogebank.crm.user_service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.scroogebank.crm.user_service.service.PersistentUserStore;

import jakarta.transaction.Transactional;

import com.scroogebank.crm.user_service.dto.UserDto;
import com.scroogebank.crm.user_service.dto.UserRole;
import com.scroogebank.crm.user_service.dto.UserStatus;

/**
 * Verifies that the Spring application context loads.
 */

@SpringBootTest
class UserServiceApplicationTests {

	@Autowired
    private PersistentUserStore store;

	@Test
	void contextLoads() {}
	
	@Test
	@Transactional
	void rootAdmin_isBootstrappedAtUsr1() {
		UserDto user = store.getUser("usr_1");
		assertNotNull(user);
		assertEquals(UserRole.admin, user.role());
		assertEquals(UserStatus.active, user.status());
	}
}

