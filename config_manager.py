#!/usr/bin/env python3
"""
Config Manager for static default settings.
"""

class ConfigManager:
    DEFAULTS = {
        "default_thickness": 5,
        "default_opacity": 0.8
    }

    def get(self, key: str, default=None):
        return self.DEFAULTS.get(key, default)

    def get_arrow_thickness(self):
        return self.DEFAULTS["default_thickness"]

    def get_arrow_opacity(self):
        return self.DEFAULTS["default_opacity"]

config_manager = ConfigManager()
