package com.scroogebank.crm.user_service.controller;

import com.scroogebank.crm.user_service.dto.CreateUserRequest;
import com.scroogebank.crm.user_service.dto.ResetPasswordRequest;
import com.scroogebank.crm.user_service.dto.UpdateUserRequest;
import com.scroogebank.crm.user_service.dto.UserDto;
import com.scroogebank.crm.user_service.dto.UsersListResponse;
import com.scroogebank.crm.user_service.security.AuthenticatedUser;
import com.scroogebank.crm.user_service.security.RequestAuth;
import com.scroogebank.crm.user_service.service.UserAccountService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * REST endpoints for user administration and self-service lookups.
 */
@RestController
@Validated
@RequestMapping("/api/users")
@Tag(name = "Users")
@SecurityRequirement(name = "bearerAuth")
@ApiResponses({
	@ApiResponse(responseCode = "400", description = "Validation failed"),
	@ApiResponse(responseCode = "401", description = "Unauthorized"),
	@ApiResponse(responseCode = "403", description = "Forbidden"),
	@ApiResponse(responseCode = "404", description = "Not found"),
	@ApiResponse(responseCode = "500", description = "Internal error")
})
public class UserController {
	private final UserAccountService userAccountService;
	private final RequestAuth requestAuth;

	public UserController(UserAccountService userAccountService, RequestAuth requestAuth) {
		this.userAccountService = userAccountService;
		this.requestAuth = requestAuth;
	}

	/**
	 * Creates a new user (admin-only or super admin-only)
	 *
	 * @param request HTTP request containing the bearer token
	 * @param body create user payload
	 * @return created user
	 */
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Create user")
	public UserDto createUser(HttpServletRequest request, @Valid @RequestBody CreateUserRequest body) {
		AuthenticatedUser requester = requestAuth.requireUser(request);
		return userAccountService.createUser(body, requester);
	}

	/**
	 * Lists users with optional role filtering (admin-only or super admin-only)
	 *
	 * @param request HTTP request containing the bearer token
	 * @param limit requested page size
	 * @param offset requested offset
	 * @param role optional role filter
	 * @return paginated list of users
	 */
	@GetMapping
	@Operation(summary = "List users")
	public UsersListResponse listUsers(
		HttpServletRequest request,
		@RequestParam(defaultValue = "50") @Min(1) @Max(200) int limit,
		@RequestParam(defaultValue = "0") @Min(0) int offset,
		@RequestParam(required = false) String role
	) {
		if (limit < 1 || limit > 200 || offset < 0) {
			throw new IllegalArgumentException("invalid pagination");
		}
		AuthenticatedUser requester = requestAuth.requireUser(request);
		return userAccountService.listUsers(limit, offset, role, requester);
	}

	/**
	 * Fetches a user by ID (admin-only or super admin-only)
	 *
	 * @param request HTTP request containing the bearer token
	 * @param userId API user identifier
	 * @return matching user
	 */
	@GetMapping("/{userId}")
	@Operation(summary = "Get user by id")
	public UserDto getUser(HttpServletRequest request, @Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String userId) {
		AuthenticatedUser requester = requestAuth.requireUser(request);
		return userAccountService.getUser(userId, requester);
	}

	/**
	 * Returns the authenticated user's own profile.
	 *
	 * @param request HTTP request containing the bearer token
	 * @return current user profile
	 */
	@GetMapping("/me")
	@Operation(summary = "Get current authenticated user")
	public UserDto me(HttpServletRequest request) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		return userAccountService.getUser(user.userId(), user);
	}
	
	/**
	 * Updates a user's profile (admin-only or super admin-only)
	 *
	 * @param request HTTP request containing the bearer token
	 * @param userId API user identifier
	 * @param body partial update payload
	 * @return updated user
	 */
	@PutMapping("/{userId}")
	@Operation(summary = "Update user")
	public UserDto updateUser(
		HttpServletRequest request,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String userId,
		@Valid @RequestBody UpdateUserRequest body
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		return userAccountService.updateUser(userId, body, user);
	}

	/**
	 * Deletes a user account (admin-only or super admin-only)
	 *
	 * @param request HTTP request containing the bearer token
	 * @param userId API user identifier
	 */
	@DeleteMapping("/{userId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Operation(summary = "Delete user")
	public void deleteUser(HttpServletRequest request, @Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String userId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		userAccountService.deleteUser(userId, user);
	}

	/**
	 * Disables a user account (superadmin or admin-only).
	 *
	 * @param request HTTP request containing the bearer token
	 * @param userId API user identifier
	 * @return updated user
	 */
	@PostMapping("/{userId}/disable")
	@Operation(summary = "Disable user")
	public UserDto disableUser(HttpServletRequest request, @Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String userId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		return userAccountService.disableUser(userId, user);
	}

	/**
	 * Resets a user's password and invalidates existing refresh tokens (admin/super admin only).
	 *
	 * @param request HTTP request containing the bearer token
	 * @param userId API user identifier
	 * @param body optional reset payload
	 * @return accepted response
	 */
	@PostMapping("/{userId}/reset-password")
	@Operation(summary = "Reset user password")
	public ResponseEntity<Void> resetPassword(
		HttpServletRequest request,
		@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$") @PathVariable String userId,
		@Valid @RequestBody(required = false) ResetPasswordRequest body
	) {
		AuthenticatedUser requester = requestAuth.requireUser(request);
		userAccountService.resetPassword(userId, body, requester);
		return ResponseEntity.status(HttpStatus.ACCEPTED).build();
	}
}
