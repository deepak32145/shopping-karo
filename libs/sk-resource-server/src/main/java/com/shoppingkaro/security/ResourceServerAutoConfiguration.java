package com.shoppingkaro.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Turns a service into an OAuth2 resource server for tokens issued by auth-service:
 * verified locally against its published public keys, stateless, JSON error bodies, and /admin/** limited to ADMIN.
 * Backs off for any bean the service defines itself.
 */
@AutoConfiguration
@EnableConfigurationProperties(SecurityProperties.class)
public class ResourceServerAutoConfiguration {

  @Bean
  @ConditionalOnMissingBean(JwtDecoder.class)
  JwtDecoder jwtDecoder(SecurityProperties props) {
    // Keys are fetched lazily on the first token, so the service can start before auth-service is up.
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(props.jwksUri()).build();
    OAuth2TokenValidator<Jwt> validators = new DelegatingOAuth2TokenValidator<>(
        JwtValidators.createDefaultWithIssuer(props.issuer()));
    decoder.setJwtValidator(validators);
    return decoder;
  }

  @Bean
  @ConditionalOnMissingBean(SecurityFilterChain.class)
  SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityProperties props, ObjectMapper json) throws Exception {
    JwtGrantedAuthoritiesConverter authorities = new JwtGrantedAuthoritiesConverter();
    authorities.setAuthoritiesClaimName("roles");
    authorities.setAuthorityPrefix("ROLE_");
    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(authorities);

    String[] publicPaths = props.publicPaths().toArray(String[]::new);
    http
        .csrf(AbstractHttpConfigurer::disable) // stateless bearer-token API, no cookies
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(a -> a
            .requestMatchers("/actuator/health/**").permitAll()
            .requestMatchers(HttpMethod.OPTIONS, "/**").permitAll()
            .requestMatchers(publicPaths).permitAll()
            .requestMatchers("/admin/**").hasRole("ADMIN")
            .anyRequest().authenticated())
        .oauth2ResourceServer(o -> o
            .jwt(j -> j.jwtAuthenticationConverter(converter))
            .authenticationEntryPoint((req, res, ex) ->
                write(json, res, HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Your session is invalid or has expired")))
        .exceptionHandling(e -> e.accessDeniedHandler((req, res, ex) ->
            write(json, res, HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have permission to do this")));
    return http.build();
  }

  private static void write(ObjectMapper json, HttpServletResponse res, HttpStatus status, String code, String detail) throws java.io.IOException {
    res.setStatus(status.value());
    res.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
    json.writeValue(res.getOutputStream(), Map.of(
        "type", "about:blank", "title", status.getReasonPhrase(), "status", status.value(), "detail", detail, "code", code));
  }
}
