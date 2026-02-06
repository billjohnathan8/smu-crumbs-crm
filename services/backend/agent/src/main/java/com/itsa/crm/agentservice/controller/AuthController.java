package com.itsa.crm.agentservice.controller;

import com.itsa.crm.agentservice.dto.LoginRequest;
import com.itsa.crm.agentservice.dto.RefreshRequest;
import com.itsa.crm.agentservice.dto.TokenResponse;
import com.itsa.crm.agentservice.service.AuthService;
import jakarta.validation.Valid;
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
}
