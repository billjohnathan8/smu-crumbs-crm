package com.scroogebank.crm.client_service.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Security configuration for the service.
 *
 * <p>Currently permits all requests; edge gateways enforce authentication in this module.</p>
 */
@Configuration
public class SecurityConfig {
	/**
	 * Builds the security filter chain for the service.
	 *
	 * @param http security builder
	 * @return configured filter chain
	 * @throws Exception when configuration fails
	 */
	@Bean
	public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		return http
			.csrf(csrf -> csrf.disable())
			.authorizeHttpRequests(authorize -> authorize
				.anyRequest().permitAll()
			)
			.build();
	}
}
