package com.scroogebank.crm.user_service.controller;

import com.scroogebank.crm.user_service.dto.LoginRequest;
import com.scroogebank.crm.user_service.dto.PerformResetPasswordRequest;
import com.scroogebank.crm.user_service.dto.RefreshRequest;
import com.scroogebank.crm.user_service.dto.ResetPasswordRequest;
import com.scroogebank.crm.user_service.dto.TokenResponse;
import com.scroogebank.crm.user_service.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
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
@Tag(name = "Auth")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "Validation failed"),
	@ApiResponse(responseCode = "500", description = "Internal error")
})
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
	@Operation(summary = "Authenticate user and issue tokens")
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
	@Operation(summary = "Refresh access token")
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
	@Operation(summary = "Initiate password reset")
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
	@Operation(summary = "Complete password reset")
	public ResponseEntity<Void> resetPassword(@Valid @RequestBody PerformResetPasswordRequest request) {
		authService.performResetPassword(request);
		return ResponseEntity.ok().build();
	}
}
