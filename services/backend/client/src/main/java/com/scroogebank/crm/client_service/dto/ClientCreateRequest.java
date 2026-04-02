package com.scroogebank.crm.client_service.dto;

import com.scroogebank.crm.client_service.entity.Gender;
import com.scroogebank.crm.client_service.validation.ValidDateOfBirth;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * Request payload for creating a client.
 */
public record ClientCreateRequest(
	@NotBlank
	@Size(min = 2, max = 50)
	@Pattern(regexp = "^[A-Za-z ]+$")
	String firstName,

	@NotBlank
	@Size(min = 2, max = 50)
	@Pattern(regexp = "^[A-Za-z ]+$")
	String lastName,

	@NotNull
	@ValidDateOfBirth
	LocalDate dateOfBirth,

	@NotNull
	Gender gender,

	@NotBlank
	@Email
	String emailAddress,

	@NotBlank
	@Pattern(regexp = "^\\+\\d{10,15}$", message = "Phone must start with + followed by 10-15 digits")
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
	String postalCode,

	@Pattern(regexp = "^[A-Za-z0-9_-]{1,128}$", message = "assignedUserId must be alphanumeric")
	String assignedUserId
) {
	public ClientCreateRequest(
		String firstName,
		String lastName,
		LocalDate dateOfBirth,
		Gender gender,
		String emailAddress,
		String phoneNumber,
		String address,
		String city,
		String state,
		String country,
		String postalCode
	) {
		this(
			firstName,
			lastName,
			dateOfBirth,
			gender,
			emailAddress,
			phoneNumber,
			address,
			city,
			state,
			country,
			postalCode,
			null
		);
	}
}
