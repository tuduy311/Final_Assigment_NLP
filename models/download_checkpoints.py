#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
models/download_checkpoints.py

Automates the downloading of Speech-to-Text (ASR) and Speaker Diarization model checkpoints
from Google Drive to the local workspace.

Usage:
    pip install -r models/requirements.txt
    python models/download_checkpoints.py
"""

import os
import sys

def main():
    # Ensure correct encoding for console output
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        
    try:
        import gdown
    except ImportError:
        print("❌ Error: 'gdown' is not installed.")
        print("👉 Please install it by running: pip install -r models/requirements.txt")
        sys.exit(1)

    print("=" * 60)
    print("        DOWNLOADING MODEL CHECKPOINTS FROM GOOGLE DRIVE")
    print("=" * 60)

    # Base directory of the script
    base_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 1. Speech-to-Text (ASR) Checkpoints
    asr_folder_id = "1HMBLN7toj2Yf1XcQzrkC521LWZhSIcDl"
    asr_output_dir = os.path.join(base_dir, "Speech_to_Text_CL")
    os.makedirs(asr_output_dir, exist_ok=True)
    
    print(f"\n📥 Downloading ASR (Speech-to-Text) Checkpoints...")
    print(f"   Destination: {asr_output_dir}")
    try:
        gdown.download_folder(
            id=asr_folder_id,
            output=asr_output_dir,
            quiet=False,
            use_cookies=False
        )
        print("✅ ASR Checkpoints downloaded successfully!")
    except Exception as e:
        print(f"❌ Failed to download ASR Checkpoints. Error: {e}")
        print("👉 Please verify your internet connection or check if the Google Drive link is still accessible.")

    # 2. Speaker Diarization Checkpoints
    diarization_folder_id = "1VwMIc2G1iHR7Z_LOf5nhyjEcpyh9k3Ex"
    diarization_output_dir = os.path.join(base_dir, "VoxConverse_Continual_Learning")
    os.makedirs(diarization_output_dir, exist_ok=True)
    
    print(f"\n📥 Downloading Speaker Diarization Checkpoints...")
    print(f"   Destination: {diarization_output_dir}")
    try:
        gdown.download_folder(
            id=diarization_folder_id,
            output=diarization_output_dir,
            quiet=False,
            use_cookies=False
        )
        print("✅ Speaker Diarization Checkpoints downloaded successfully!")
    except Exception as e:
        print(f"❌ Failed to download Speaker Diarization Checkpoints. Error: {e}")
        print("👉 Please verify your internet connection or check if the Google Drive link is still accessible.")

    print("\n" + "=" * 60)
    print("🎉 Downloader script finished execution!")
    print("=" * 60)

if __name__ == "__main__":
    main()
