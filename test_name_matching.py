#!/usr/bin/env python3
"""
Test the name matching logic specifically
"""

def create_name_variants(name):
    variants = [name]
    if '_' in name:
        variants.append(name.replace('_', ' '))
        # Also try swapping first/last name: "Hikaru_Nakamura" -> "nakamura hikaru"
        parts = name.split('_')
        if len(parts) == 2:
            variants.append(f"{parts[1]} {parts[0]}")
    elif ' ' in name:
        variants.append(name.replace(' ', '_'))
        # Also try swapping first/last name: "Nakamura Hikaru" -> "hikaru nakamura"
        parts = name.split(' ')
        if len(parts) == 2:
            variants.append(f"{parts[1]} {parts[0]}")
            variants.append(f"{parts[1]}_{parts[0]}")
    return variants

def name_matches(player_variants, target_name):
    target_lower = target_name.lower()
    for variant in player_variants:
        if variant in target_lower or target_lower in variant:
            return True
    return False

def test_name_matching():
    # Test case: Looking for "Hikaru_Nakamura", found "Nakamura Hikaru" in PGN
    search_name = "Hikaru_Nakamura"
    normalized_search_name = search_name.lower()
    pgn_white = "Wei Yi"
    pgn_black = "Nakamura Hikaru"
    
    print(f"🔍 Testing name matching:")
    print(f"   Search name: '{search_name}' -> normalized: '{normalized_search_name}'")
    print(f"   PGN White: '{pgn_white}'")
    print(f"   PGN Black: '{pgn_black}'")
    
    # Create variants for search name
    variants = create_name_variants(normalized_search_name)
    print(f"   Variants created: {variants}")
    
    # Test matching against white player
    white_match = name_matches(variants, pgn_white)
    print(f"   Match against white '{pgn_white}': {white_match}")
    
    # Test matching against black player
    black_match = name_matches(variants, pgn_black)
    print(f"   Match against black '{pgn_black}': {black_match}")
    
    print(f"\n📊 Result: Player found as {'White' if white_match else 'Black' if black_match else 'Neither'}")

if __name__ == "__main__":
    test_name_matching()
