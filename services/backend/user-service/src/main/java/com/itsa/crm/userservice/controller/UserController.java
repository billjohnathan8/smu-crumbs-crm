package com.itsa.crm.userservice.controller;

import com.itsa.crm.userservice.dto.UserDto;
import com.itsa.crm.userservice.service.UserService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
public class UserController {
    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public List<UserDto> listUsers() {
        return userService.listUsers();
    }

    @GetMapping("/health")
    public String health() {
        return "{ \"status\": \"ok\" }";
    }
}