#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
data/prepare_librispeech.py

Prepares and partitions the LibriSpeech ASR dataset into 5 Parts:
Each part contains:
  - Train: 2000 samples (from openslr/librispeech_asr clean train.100)
  - Validation: 200 samples (from openslr/librispeech_asr clean validation)
  - Test: 200 samples (from openslr/librispeech_asr other test)

Saves audio files in 16kHz mono WAV format and outputs metadata.jsonl files.

Requirements:
    pip install datasets soundfile librosa tqdm argparse
"""

import os
import argparse
import json
import numpy as np
import soundfile as sf

def setup_args():
    parser = argparse.ArgumentParser(description="Prepare and partition LibriSpeech ASR dataset into 5 parts.")
    parser.add_argument(
        "--output_dir", 
        type=str, 
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "ASR"),
        help="Target folder to save partitioned STT datasets"
    )
    parser.add_argument(
        "--dry_run",
        action="store_true",
        help="If set, downloads only a tiny mock slice (2 train, 2 val, 2 test) to verify the pipeline quickly."
    )
    return parser.parse_args()

def preprocess_audio(audio_array, orig_sr, target_sr=16000):
    """Convert to mono and resample if necessary."""
    if len(audio_array.shape) > 1:
        # Average across channels (soundfile returns samples, channels; HF returns channels, samples)
        if audio_array.shape[0] < audio_array.shape[1]:
            audio_array = np.mean(audio_array, axis=0)
        else:
            audio_array = np.mean(audio_array, axis=1)
    if orig_sr != target_sr:
        import librosa
        audio_array = librosa.resample(audio_array, orig_sr=orig_sr, target_sr=target_sr)
    return audio_array, target_sr

def save_subset(dataset, subset_name, part_dir, target_size):
    """Downloads and saves a subset of files to a specific part folder."""
    from tqdm import tqdm
    subset_dir = os.path.join(part_dir, subset_name)
    os.makedirs(subset_dir, exist_ok=True)
    
    metadata = []
    print(f"   Downloading & preparing '{subset_name}' split ({target_size} samples)...")
    
    # We load streaming dataset iterator
    iterator = iter(dataset)
    
    for idx in tqdm(range(target_size)):
        try:
            sample = next(iterator)
        except StopIteration:
            print(f"   ⚠️ End of dataset reached early at sample {idx}.")
            break
            
        import io
        audio = sample["audio"]
        arr, sr = sf.read(io.BytesIO(audio["bytes"]))
        text = sample["text"]
        file_id = os.path.splitext(os.path.basename(sample["file"]))[0]
        
        # Resample to 16kHz mono
        clean_arr, target_sr = preprocess_audio(arr, sr)
        
        # Save as WAV
        filename = f"{file_id}.wav"
        filepath = os.path.join(subset_dir, filename)
        sf.write(filepath, clean_arr, target_sr)
        
        # Store metadata
        metadata.append({
            "file_name": filename,
            "text": text,
            "original_file_id": file_id
        })
        
    # Write metadata.jsonl for Hugging Face AudioFolder support
    metadata_path = os.path.join(subset_dir, "metadata.jsonl")
    with open(metadata_path, "w", encoding="utf-8") as f:
        for entry in metadata:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            
    print(f"   ✓ Saved '{subset_name}' subset to {subset_dir}")

def main():
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        
    args = setup_args()
    
    print("=" * 60)
    print("      LIBRISPEECH (STT) DATASET PARTITIONING TOOL")
    print("=" * 60)
    print(f"Output directory : {args.output_dir}")
    print(f"Dry run mode     : {args.dry_run}")
    
    # Lazy imports for heavy dependencies
    from datasets import load_dataset
    
    # Setup sizes
    train_size = 2000 if not args.dry_run else 2
    val_size = 200 if not args.dry_run else 2
    test_size = 200 if not args.dry_run else 2
    
    total_parts = 5
    
    print("\n📥 Connecting to Hugging Face LibriSpeech datasets (Streaming Mode)...")
    import datasets
    raw_train_stream = load_dataset("openslr/librispeech_asr", "clean", split="train.100", streaming=True).cast_column("audio", datasets.Audio(decode=False))
    raw_val_stream = load_dataset("openslr/librispeech_asr", "clean", split="validation", streaming=True).cast_column("audio", datasets.Audio(decode=False))
    raw_test_stream = load_dataset("openslr/librispeech_asr", "other", split="test", streaming=True).cast_column("audio", datasets.Audio(decode=False))
    
    for part in range(1, total_parts + 1):
        print(f"\n📦 Preparing [PART {part}/{total_parts}]...")
        part_dir = os.path.join(args.output_dir, f"part_{part}")
        os.makedirs(part_dir, exist_ok=True)
        
        # Calculate offsets
        skip_train = (part - 1) * train_size
        skip_val = (part - 1) * val_size
        skip_test = (part - 1) * test_size
        
        # Slice datasets
        part_train = raw_train_stream.skip(skip_train).take(train_size)
        part_val = raw_val_stream.skip(skip_val).take(val_size)
        part_test = raw_test_stream.skip(skip_test).take(test_size)
        
        # Save splits
        save_subset(part_train, "train", part_dir, train_size)
        save_subset(part_val, "validation", part_dir, val_size)
        save_subset(part_test, "test", part_dir, test_size)
        
    print("\n🎉 LibriSpeech partitioning complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
