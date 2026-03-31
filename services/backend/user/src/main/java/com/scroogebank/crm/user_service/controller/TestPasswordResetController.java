package com.scroogebank.crm.user_service.controller;

import com.scroogebank.crm.user_service.service.UserStore;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Test-only controller that exposes password reset tokens for local/test E2E workflows.
 */
@RestController
@Profile({"local", "test", "dev"})
@RequestMapping("/api/test/password-reset")
public class TestPasswordResetController {

	private final UserStore userStore;

	public TestPasswordResetController(UserStore userStore) {
		this.userStore = userStore;
	}

	@GetMapping("/latest-token")
	public ResponseEntity<Map<String, String>> getLatestToken(@RequestParam String email) {
		String token = userStore.getLatestResetToken(email);
		if (token == null) {
			return ResponseEntity.notFound().build();
		}
		return ResponseEntity.ok(Map.of("token", token));
	}
}
