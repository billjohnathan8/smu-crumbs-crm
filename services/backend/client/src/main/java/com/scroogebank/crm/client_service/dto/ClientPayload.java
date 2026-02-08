package com.scroogebank.crm.client_service.dto;

import com.scroogebank.crm.client_service.entity.Gender;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * Shared client fields used by legacy upsert flows.
 */
public record ClientPayload(
	@NotBlank
	@Size(min = 2, max = 50)
	@Pattern(regexp = "^[A-Za-z ]+$")
	String firstName,

	@NotBlank
	@Size(min = 2, max = 50)
	@Pattern(regexp = "^[A-Za-z ]+$")
	String lastName,

	@NotNull
	LocalDate dateOfBirth,

	@NotNull
	Gender gender,

	@NotBlank
	@Email
	String emailAddress,

	@NotBlank
	@Pattern(regexp = "^\\+?[0-9]{10,15}$")
	String phoneNumber,

	@NotBlank
	@Size(min = 5, max = 100)
	String address,

	@NotBlank
	@Size(min = 2, max = 50)
	String city,

	@NotBlank
	@Size(min = 2, max = 50)
	String state,

	@NotBlank
	@Size(min = 2, max = 50)
	String country,

	@NotBlank
	@Size(min = 4, max = 10)
	String postalCode
) {}
