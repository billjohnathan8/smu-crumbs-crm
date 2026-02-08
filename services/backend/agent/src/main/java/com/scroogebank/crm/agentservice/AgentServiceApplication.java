package com.scroogebank.crm.agentservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Spring Boot entry point for the agent-service application.
 */
@SpringBootApplication
public class AgentServiceApplication {

	/**
	 * Bootstraps the Spring application context.
	 *
	 * @param args command-line arguments
	 */
	public static void main(String[] args) {
		SpringApplication.run(AgentServiceApplication.class, args);
	}

}
