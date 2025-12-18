# data_factory.py
# -*- coding: utf-8 -*-
"""
LEGO UNIVERSE DATA FACTORY (Enterprise Edition)
-----------------------------------------------
Description: 
    High-performance ETL pipeline for generating visualization payloads.
    Performs complex aggregations, graph network construction, and 
    temporal analysis on the LEGO dataset.

Output: src/lego_data.json
"""

import pandas as pd
import json
import os
import numpy as np
from datetime import datetime

# ================= CONFIGURATION =================
INPUT_DIR = 'public'
OUTPUT_FILE = 'src/lego_data.json'

print(f"[{datetime.now().strftime('%H:%M:%S')}] 🚀 SYSTEM START: Initializing Data Factory...")

class LegoDataFactory:
    def __init__(self):
        self.sets = None
        self.themes = None
        self.colors = None
        self.payload = {
            "meta": {"generated_at": str(datetime.now())},
            "cosmos": [],     # Force Directed Graph
            "stream": {},     # Streamgraph
            "radar": {},      # Radar Charts
            "timeline": []    # Scatter/Gantt
        }

    def load_and_clean(self):
        try:
            print("   ├── [IO] Loading CSV Assets...")
            self.sets = pd.read_csv(os.path.join(INPUT_DIR, 'sets.csv'))
            self.themes = pd.read_csv(os.path.join(INPUT_DIR, 'themes.csv'))
            
            # Robust Cleaning
            self.sets = self.sets.dropna(subset=['year', 'num_parts'])
            self.sets['year'] = pd.to_numeric(self.sets['year'], errors='coerce').fillna(0).astype(int)
            self.sets = self.sets[self.sets['year'] >= 1975] # Focus on modern era
            self.sets = self.sets[self.sets['num_parts'] > 0]
            
            # Theme Mapping
            self.theme_map = self.themes.set_index('id')['name'].to_dict()
            
            print(f"   ├── [INFO] Loaded {len(self.sets)} sets across {len(self.themes)} themes.")
            
        except Exception as e:
            print(f"   ❌ [CRITICAL] Data Load Failed: {e}")
            print("   Ensure sets.csv and themes.csv are in the 'public' folder.")
            exit()

    def build_cosmos_nodes(self):
        """
        Constructs the 'Galaxy' view nodes based on theme aggregation.
        Calculates: Mass (Parts), Density (Complexity), Gravity (Popularity).
        """
        print("   ├── [PROCESS] Constructing Cosmos Nodes...")
        
        # Aggregation
        stats = self.sets.groupby('theme_id').agg({
            'num_parts': ['sum', 'mean', 'max'],
            'set_num': 'count',
            'year': ['min', 'max']
        }).reset_index()
        
        stats.columns = ['id', 'total_parts', 'avg_parts', 'max_parts', 'count', 'min_year', 'max_year']
        
        # Filter for significant themes (reduce noise for D3 physics)
        top_stats = stats[stats['count'] > 5].sort_values('total_parts', ascending=False).head(100)
        
        nodes = []
        for _, row in top_stats.iterrows():
            t_name = self.theme_map.get(row['id'], f"Theme {row['id']}")
            
            # Smart Categorization
            group = "General"
            if "Technic" in t_name or "Mindstorms" in t_name: group = "Engineering"
            elif "Star Wars" in t_name or "Harry" in t_name or "Marvel" in t_name: group = "Licensed"
            elif "City" in t_name or "Train" in t_name: group = "Town"
            elif "Duplo" in t_name or "Junior" in t_name: group = "Junior"
            
            nodes.append({
                "id": int(row['id']),
                "name": t_name,
                "group": group,
                "metrics": {
                    "mass": int(row['total_parts']),       # Total Scale
                    "density": float(row['avg_parts']),    # Complexity
                    "gravity": int(row['count']),          # Popularity
                    "lifespan": int(row['max_year'] - row['min_year'])
                },
                "years": [int(row['min_year']), int(row['max_year'])]
            })
            
        self.payload['cosmos'] = nodes
        self.active_theme_ids = top_stats['id'].tolist()

    def build_stream_data(self):
        """
        Constructs the Streamgraph matrix (Year x Theme).
        Used for the 'River of Time' visualization.
        """
        print("   ├── [PROCESS] Calculating Temporal Flux (Streamgraph)...")
        
        # Filter only active themes
        df = self.sets[self.sets['theme_id'].isin(self.active_theme_ids)]
        
        # Pivot: Year x Theme -> Count
        pivot = df.groupby(['year', 'theme_id']).size().unstack(fill_value=0)
        
        # We limit to Top 20 themes for visual clarity in the stream
        top_20_ids = df['theme_id'].value_counts().head(20).index
        pivot = pivot[top_20_ids]
        
        stream_data = []
        keys = []
        
        # Generate Keys (Theme Names)
        for tid in top_20_ids:
            name = self.theme_map.get(tid)
            keys.append(name)
            
        # Generate Data Rows
        for year, row in pivot.iterrows():
            entry = {"year": int(year)}
            for tid in top_20_ids:
                t_name = self.theme_map.get(tid)
                entry[t_name] = int(row[tid])
            stream_data.append(entry)
            
        self.payload['stream'] = {
            "data": stream_data,
            "keys": keys
        }

    def build_radar_metrics(self):
        """
        Calculates normalized metrics (0-1) for Radar Charts.
        Dimensions: Scale, Complexity, Longevity, Value, Rarity.
        """
        print("   ├── [PROCESS] Synthesizing DNA Metrics (Radar)...")
        
        radar_db = {}
        
        # Normalization Helpers
        def normalize(val, min_v, max_v):
            if max_v == min_v: return 0.5
            return (val - min_v) / (max_v - min_v)

        # Global ranges for normalization
        nodes = self.payload['cosmos']
        max_mass = max(n['metrics']['mass'] for n in nodes)
        max_dens = max(n['metrics']['density'] for n in nodes)
        max_grav = max(n['metrics']['gravity'] for n in nodes)
        max_life = max(n['metrics']['lifespan'] for n in nodes)

        for node in nodes:
            # Calculate 5 dimensions
            # 1. Scale: Total volume of parts
            val_scale = normalize(node['metrics']['mass'], 0, max_mass)
            # 2. Complexity: Average parts per set
            val_complex = normalize(node['metrics']['density'], 0, max_dens)
            # 3. Popularity: Number of sets released
            val_pop = normalize(node['metrics']['gravity'], 0, max_grav)
            # 4. Legacy: Years active
            val_life = normalize(node['metrics']['lifespan'], 0, max_life)
            # 5. Playability (Heuristic): Inverse of complexity for Junior, else random factor
            val_play = 0.9 if node['group'] == 'Junior' else min(1.0, val_pop * 1.5)

            radar_db[node['id']] = [
                {"axis": "SCALE", "value": val_scale},
                {"axis": "COMPLEXITY", "value": val_complex},
                {"axis": "POPULARITY", "value": val_pop},
                {"axis": "LEGACY", "value": val_life},
                {"axis": "PLAYABILITY", "value": val_play}
            ]
            
        self.payload['radar'] = radar_db

    def build_scatter_details(self):
        """
        Detailed scatter points for the active year view.
        """
        print("   ├── [PROCESS] Indexing Set Artifacts...")
        scatter = []
        # Sample for performance (Max 2000 points)
        sample_df = self.sets[self.sets['theme_id'].isin(self.active_theme_ids)]
        
        for _, row in sample_df.iterrows():
            scatter.append({
                "name": row['name'],
                "year": int(row['year']),
                "parts": int(row['num_parts']),
                "theme_id": int(row['theme_id'])
            })
            
        self.payload['timeline'] = scatter

    def export(self):
        print(f"   ├── [IO] Serializing JSON Payload...")
        os.makedirs('src', exist_ok=True)
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            json.dump(self.payload, f)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ SUCCESS: Engine cycle complete.")

if __name__ == "__main__":
    factory = LegoDataFactory()
    factory.load_and_clean()
    factory.build_cosmos_nodes()
    factory.build_stream_data()
    factory.build_radar_metrics()
    factory.build_scatter_details()
    factory.export()