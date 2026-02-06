package com.itsa.crm.userservice.controller;

import com.itsa.crm.userservice.dto.CreateUserRequest;
import com.itsa.crm.userservice.dto.ResetPasswordRequest;
import com.itsa.crm.userservice.dto.UpdateUserRequest;
import com.itsa.crm.userservice.dto.UserDto;
import com.itsa.crm.userservice.dto.UsersListResponse;
import com.itsa.crm.userservice.security.AuthenticatedUser;
import com.itsa.crm.userservice.security.ForbiddenException;
import com.itsa.crm.userservice.security.RequestAuth;
import com.itsa.crm.userservice.service.UserAccountService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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

@RestController
@RequestMapping("/api/users")
public class UserController {
	private final UserAccountService userAccountService;
	private final RequestAuth requestAuth;

	public UserController(UserAccountService userAccountService, RequestAuth requestAuth) {
		this.userAccountService = userAccountService;
		this.requestAuth = requestAuth;
	}

	@GetMapping
	public UsersListResponse listUsers(
		HttpServletRequest request,
		@RequestParam(defaultValue = "50") int limit,
		@RequestParam(defaultValue = "0") int offset,
		@RequestParam(required = false) String role
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAdmin(user);
		return userAccountService.listUsers(limit, offset, role);
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public UserDto createUser(HttpServletRequest request, @Valid @RequestBody CreateUserRequest body) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAdmin(user);
		return userAccountService.createUser(body);
	}

	@GetMapping("/me")
	public UserDto me(HttpServletRequest request) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		return userAccountService.getUser(user.userId());
	}

	@GetMapping("/{userId}")
	public UserDto getUser(HttpServletRequest request, @PathVariable String userId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAdmin(user);
		return userAccountService.getUser(userId);
	}

	@PutMapping("/{userId}")
	public UserDto updateUser(
		HttpServletRequest request,
		@PathVariable String userId,
		@Valid @RequestBody UpdateUserRequest body
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAdmin(user);
		return userAccountService.updateUser(userId, body);
	}

	@DeleteMapping("/{userId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteUser(HttpServletRequest request, @PathVariable String userId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAdmin(user);
		userAccountService.deleteUser(userId);
	}

	@PostMapping("/{userId}/disable")
	public UserDto disableUser(HttpServletRequest request, @PathVariable String userId) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAdmin(user);
		return userAccountService.disableUser(userId);
	}

	@PostMapping("/{userId}/reset-password")
	public ResponseEntity<Void> resetPassword(
		HttpServletRequest request,
		@PathVariable String userId,
		@RequestBody(required = false) ResetPasswordRequest body
	) {
		AuthenticatedUser user = requestAuth.requireUser(request);
		requireAdmin(user);
		userAccountService.resetPassword(userId, body);
		return ResponseEntity.status(HttpStatus.ACCEPTED).build();
	}

	private static void requireAdmin(AuthenticatedUser user) {
		if (!user.isAdmin()) {
			throw new ForbiddenException("forbidden");
		}
	}
}
