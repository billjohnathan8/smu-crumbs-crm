package com.scroogebank.crm.client_service.validation;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Validates that a date of birth is in the past and the resulting age is between 18 and 100 years.
 */
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = DateOfBirthValidator.class)
public @interface ValidDateOfBirth {
	String message() default "Date of birth must be in the past with age between 18 and 100";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};
}
