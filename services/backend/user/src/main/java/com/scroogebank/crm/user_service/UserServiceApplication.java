package com.scroogebank.crm.user_service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Boot entry point for the user-service application.
 */
// Add a comment at the top
// Test CI pipeline
@SpringBootApplication
public class UserServiceApplication {

	/**
	 * Bootstraps the Spring application context.
	 *
	 * @param args command-line arguments
	 */
	public static void main(String[] args) {
		SpringApplication.run(UserServiceApplication.class, args);
	}

}
