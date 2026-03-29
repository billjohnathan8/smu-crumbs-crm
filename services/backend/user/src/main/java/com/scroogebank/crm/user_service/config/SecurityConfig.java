package com.scroogebank.crm.user_service.config;

import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.HttpMethod;
import org.springframework.security.authorization.AuthorizationDecision;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import com.scroogebank.crm.user_service.security.JwtAuthFilter;

/**
 * Security configuration for the user service.
 *
 * <p>Denies all unauthenticated requests by default. The {@link JwtAuthFilter} validates
 * bearer tokens before the request reaches controllers. Health endpoints and CORS preflight
 * requests are explicitly permitted without authentication.</p>
 */
@Configuration
public class SecurityConfig {

	private final JwtAuthFilter jwtAuthFilter;
	private final boolean testEndpointsEnabled;
	private final List<String> corsAllowedOrigins;

	public SecurityConfig(
		JwtAuthFilter jwtAuthFilter,
		Environment environment,
		@Value("${app.cors.allowed-origins:*}") String corsAllowedOrigins
	) {
		this.jwtAuthFilter = jwtAuthFilter;
		this.testEndpointsEnabled = environment.acceptsProfiles(Profiles.of("local", "test"));
		this.corsAllowedOrigins = List.of(corsAllowedOrigins.split(","));
	}

	@Bean
	public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		return http
			.cors(cors -> cors.configurationSource(corsConfigurationSource()))
			.csrf(csrf -> csrf.disable())
			.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			.authorizeHttpRequests(authorize -> authorize
				.requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
				.requestMatchers("/health", "/api/v1/logs/health").permitAll()
				.requestMatchers("/api/auth/**").permitAll()
				.requestMatchers("/api/test/**").access((authentication, context) ->
					new AuthorizationDecision(testEndpointsEnabled)
				)
				.anyRequest().authenticated()
			)
			.addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
			.build();
	}

	@Bean
	public CorsConfigurationSource corsConfigurationSource() {
		CorsConfiguration config = new CorsConfiguration();
		config.setAllowedOriginPatterns(corsAllowedOrigins);
		config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
		config.setAllowedHeaders(List.of("*"));
		config.setAllowCredentials(false);
		UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", config);
		return source;
	}
}
