package com.itsa.crm.clients_service;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Boot entry point for the clients service.
 */
@SpringBootApplication
public class ClientsServiceApplication {

	/**
	 * Boots the Spring application context.
	 *
	 * @param args command-line arguments
	 */
	public static void main(String[] args) {
		SpringApplication.run(ClientsServiceApplication.class, args);
	}

}
