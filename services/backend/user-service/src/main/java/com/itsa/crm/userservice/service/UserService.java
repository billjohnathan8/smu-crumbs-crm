package com.itsa.crm.userservice.service;

import com.itsa.crm.userservice.dto.UserDto;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class UserService {
    public List<UserDto> listUsers() {
        return List.of();
    }
}