package com.scroogebank.crm.userservice.exception;

import com.scroogebank.crm.userservice.api.ErrorResponse;
import com.scroogebank.crm.userservice.security.ForbiddenException;
import com.scroogebank.crm.userservice.security.JwtValidationException;
import com.scroogebank.crm.userservice.security.UnauthorizedException;
import com.scroogebank.crm.userservice.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Maps application exceptions into consistent API error responses.
 */
@RestControllerAdvice
public class ApiExceptionHandler {
	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
	@ExceptionHandler(UserNotFoundException.class)
	public ResponseEntity<ErrorResponse> handleNotFound(HttpServletRequest request, UserNotFoundException ex) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(request, "not_found", ex.getMessage()));
	}

	@ExceptionHandler(DuplicateUserException.class)
	public ResponseEntity<ErrorResponse> handleConflict(HttpServletRequest request, DuplicateUserException ex) {
		return ResponseEntity.status(HttpStatus.CONFLICT).body(error(request, "conflict", ex.getMessage()));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ResponseEntity<ErrorResponse> handleValidation(HttpServletRequest request, MethodArgumentNotValidException ex) {
		String message = ex.getBindingResult().getFieldErrors().stream()
			.map(err -> err.getField() + ": " + (err.getDefaultMessage() == null ? "invalid" : err.getDefaultMessage()))
			.collect(Collectors.joining("; "));
		if (message.isBlank()) {
			message = "Validation failed";
		}
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", message));
	}

	@ExceptionHandler(ConstraintViolationException.class)
	public ResponseEntity<ErrorResponse> handleConstraintViolation(HttpServletRequest request, ConstraintViolationException ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", ex.getMessage()));
	}

	@ExceptionHandler({UnauthorizedException.class, JwtValidationException.class})
	public ResponseEntity<ErrorResponse> handleUnauthorized(HttpServletRequest request, RuntimeException _ex) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error(request, "unauthorized", "Unauthorized"));
	}

	@ExceptionHandler(ForbiddenException.class)
	public ResponseEntity<ErrorResponse> handleForbidden(HttpServletRequest request, ForbiddenException _ex) {
		return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error(request, "forbidden", "Forbidden"));
	}

	@ExceptionHandler(IllegalArgumentException.class)
	public ResponseEntity<ErrorResponse> handleBadRequest(HttpServletRequest request, IllegalArgumentException _ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", "Invalid request"));
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> handleInternal(HttpServletRequest request, Exception ex) {
		log.error("Unhandled exception for {} {}", request.getMethod(), request.getRequestURI(), ex);
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error(request, "internal_error", "Internal error"));
	}

	/**
	 * Builds a standardized error response with a request correlation id.
	 *
	 * @param request HTTP request
	 * @param error error code
	 * @param message error message
	 * @return API error response
	 */
	private static ErrorResponse error(HttpServletRequest request, String error, String message) {
		Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
		return new ErrorResponse(error, message, requestId == null ? null : requestId.toString());
	}
}
