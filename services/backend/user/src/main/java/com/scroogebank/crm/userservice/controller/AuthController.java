package com.scroogebank.crm.userservice.controller;

import com.scroogebank.crm.userservice.dto.LoginRequest;
import com.scroogebank.crm.userservice.dto.PerformResetPasswordRequest;
import com.scroogebank.crm.userservice.dto.RefreshRequest;
import com.scroogebank.crm.userservice.dto.ResetPasswordRequest;
import com.scroogebank.crm.userservice.dto.TokenResponse;
import com.scroogebank.crm.userservice.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST endpoints for authentication and token refresh.
 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {
	private final AuthService authService;

	public AuthController(AuthService authService) {
		this.authService = authService;
	}

	/**
	 * Authenticates a user and returns access/refresh tokens.
	 *
	 * @param request login credentials
	 * @return token pair and metadata
	 */
	@PostMapping("/login")
	public TokenResponse login(@Valid @RequestBody LoginRequest request) {
		return authService.login(request);
	}

	/**
	 * Rotates a refresh token and returns a new access token.
	 *
	 * @param request refresh token payload
	 * @return new token pair and metadata
	 */
	@PostMapping("/refresh")
	public TokenResponse refresh(@Valid @RequestBody RefreshRequest request) {
		return authService.refresh(request);
	}

	/**
	 * Initiates a password reset flow. Always returns 200 to avoid leaking email existence.
	 *
	 * @param request forgot password request with email
	 * @return empty 200 response
	 */
	@PostMapping("/forgot-password")
	public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ResetPasswordRequest request) {
		authService.forgotPassword(request);
		return ResponseEntity.ok().build();
	}

	/**
	 * Resets a user's password using a valid reset token.
	 *
	 * @param request reset request with token and new password
	 * @return empty 200 response
	 */
	@PostMapping("/reset-password")
	public ResponseEntity<Void> resetPassword(@Valid @RequestBody PerformResetPasswordRequest request) {
		authService.performResetPassword(request);
		return ResponseEntity.ok().build();
	}
}
