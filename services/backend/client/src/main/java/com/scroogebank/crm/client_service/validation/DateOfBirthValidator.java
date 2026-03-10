package com.scroogebank.crm.client_service.validation;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

/**
 * Ensures the date is in the past and represents an age between 18 and 100 years inclusive.
 */
public class DateOfBirthValidator implements ConstraintValidator<ValidDateOfBirth, LocalDate> {

	private static final int MIN_AGE = 18;
	private static final int MAX_AGE = 100;

	@Override
	public boolean isValid(LocalDate value, ConstraintValidatorContext context) {
		if (value == null) {
			return true;
		}
		LocalDate today = LocalDate.now();
		if (!value.isBefore(today)) {
			return false;
		}
		long age = ChronoUnit.YEARS.between(value, today);
		return age >= MIN_AGE && age <= MAX_AGE;
	}
}
