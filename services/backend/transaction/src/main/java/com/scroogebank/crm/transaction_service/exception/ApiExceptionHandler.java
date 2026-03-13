package com.scroogebank.crm.transaction_service.exception;

import com.scroogebank.crm.transaction_service.api.ErrorResponse;
import com.scroogebank.crm.transaction_service.security.ForbiddenException;
import com.scroogebank.crm.transaction_service.security.JwtValidationException;
import com.scroogebank.crm.transaction_service.security.UnauthorizedException;
import com.scroogebank.crm.transaction_service.web.RequestIdFilter;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

/**
 * Maps domain and validation exceptions to consistent API error responses.
 */
@RestControllerAdvice
public class ApiExceptionHandler {
	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	/**
	 * Handles missing transaction or import batch lookups.
	 */
	@ExceptionHandler({TransactionNotFoundException.class, ImportBatchNotFoundException.class})
	public ResponseEntity<ErrorResponse> handleNotFound(HttpServletRequest request, RuntimeException ex) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error(request, "not_found", ex.getMessage()));
	}

	/**
	 * Handles bean validation errors for request bodies.
	 */
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

	/**
	 * Handles bean validation errors for request parameters.
	 */
	@ExceptionHandler(ConstraintViolationException.class)
	public ResponseEntity<ErrorResponse> handleConstraintViolation(HttpServletRequest request, ConstraintViolationException ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", ex.getMessage()));
	}

	/**
	 * Handles malformed JSON or unknown properties in request bodies.
	 */
	@ExceptionHandler(HttpMessageNotReadableException.class)
	public ResponseEntity<ErrorResponse> handleUnreadableBody(
		HttpServletRequest request,
		HttpMessageNotReadableException _ex
	) {
		return ResponseEntity
			.status(HttpStatus.BAD_REQUEST)
			.body(error(request, "validation_error", "Invalid request body"));
	}

	/**
	 * Handles type conversion failures for query/path parameters.
	 */
	@ExceptionHandler(MethodArgumentTypeMismatchException.class)
	public ResponseEntity<ErrorResponse> handleTypeMismatch(
		HttpServletRequest request,
		MethodArgumentTypeMismatchException ex
	) {
		String message = "Invalid request parameter";
		if (ex.getName() != null && !ex.getName().isBlank()) {
			message += ": " + ex.getName();
		}
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", message));
	}

	/**
	 * Handles authentication failures or invalid JWTs.
	 */
	@ExceptionHandler({UnauthorizedException.class, JwtValidationException.class})
	public ResponseEntity<ErrorResponse> handleUnauthorized(HttpServletRequest request, RuntimeException _ex) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(error(request, "unauthorized", "Unauthorized"));
	}

	/**
	 * Handles authorization failures.
	 */
	@ExceptionHandler(ForbiddenException.class)
	public ResponseEntity<ErrorResponse> handleForbidden(HttpServletRequest request, ForbiddenException _ex) {
		return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error(request, "forbidden", "Forbidden"));
	}

	/**
	 * Handles malformed requests that fail lightweight validation.
	 */
	@ExceptionHandler(IllegalArgumentException.class)
	public ResponseEntity<ErrorResponse> handleBadRequest(HttpServletRequest request, IllegalArgumentException _ex) {
		return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(error(request, "validation_error", "Invalid request"));
	}

	/**
	 * Catch-all handler for unexpected server errors.
	 */
	@ExceptionHandler(Exception.class)
	public ResponseEntity<ErrorResponse> handleInternal(HttpServletRequest request, Exception ex) {
		Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
		log.error("Unhandled exception (requestId={})", requestId == null ? "unknown" : requestId.toString(), ex);
		return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(error(request, "internal_error", "Internal error"));
	}

	private static ErrorResponse error(HttpServletRequest request, String error, String message) {
		Object requestId = request.getAttribute(RequestIdFilter.REQUEST_ID_ATTRIBUTE);
		return new ErrorResponse(error, message, requestId == null ? null : requestId.toString());
	}
}



