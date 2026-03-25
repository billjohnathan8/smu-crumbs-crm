package com.scroogebank.crm.user_service.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.scroogebank.crm.user_service.service.UserStore;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

class TestPasswordResetControllerTest {

	private UserStore userStore;
	private TestPasswordResetController controller;

	@BeforeEach
	void setUp() {
		userStore = mock(UserStore.class);
		controller = new TestPasswordResetController(userStore);
	}

	@Test
	void getLatestToken_tokenExists_returns200WithToken() {
		when(userStore.getLatestResetToken("test@example.com")).thenReturn("reset-token-123");

		ResponseEntity<Map<String, String>> response = controller.getLatestToken("test@example.com");

		assertEquals(HttpStatus.OK, response.getStatusCode());
		assertEquals("reset-token-123", response.getBody().get("token"));
	}

	@Test
	void getLatestToken_tokenMissing_returns404() {
		when(userStore.getLatestResetToken("unknown@example.com")).thenReturn(null);

		ResponseEntity<Map<String, String>> response = controller.getLatestToken("unknown@example.com");

		assertEquals(HttpStatus.NOT_FOUND, response.getStatusCode());
		assertNull(response.getBody());
	}
}
