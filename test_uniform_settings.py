#!/usr/bin/env python3
"""
Quick test for uniform arrow settings
"""

import requests
import json

BASE_URL = "http://localhost:8000"

def test_basic_functionality():
    print("🧪 Testing basic uniform arrow settings...")
    
    try:
        # Test 1: Get current settings
        print("\n1. Getting current settings...")
        response = requests.get(f"{BASE_URL}/api/get_arrow_settings")
        if response.status_code == 200:
            settings = response.json()
            print(f"✅ Settings: {json.dumps(settings, indent=2)}")
        else:
            print(f"❌ Failed: {response.status_code}")
            return
        
        # Test 2: Set uniform thickness
        print("\n2. Setting uniform thickness to True...")
        response = requests.post(f"{BASE_URL}/api/set_arrow_thickness", 
                               json={"uniform": True})
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Result: {json.dumps(result, indent=2)}")
        else:
            print(f"❌ Failed: {response.status_code}")
        
        # Test 3: Set uniform opacity
        print("\n3. Setting uniform opacity to True...")
        response = requests.post(f"{BASE_URL}/api/set_arrow_opacity", 
                               json={"uniform": True})
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Result: {json.dumps(result, indent=2)}")
        else:
            print(f"❌ Failed: {response.status_code}")
        
        # Test 4: Get settings again
        print("\n4. Getting settings after changes...")
        response = requests.get(f"{BASE_URL}/api/get_arrow_settings")
        if response.status_code == 200:
            settings = response.json()
            print(f"✅ Updated settings: {json.dumps(settings, indent=2)}")
        else:
            print(f"❌ Failed: {response.status_code}")
            
        print("\n🎯 Test completed!")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_basic_functionality()
