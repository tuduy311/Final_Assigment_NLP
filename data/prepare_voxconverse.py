#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
data/prepare_voxconverse.py

Prepares and partitions the VoxConverse dataset into 3 Parts.
Each part contains:
  - Dev/Train split: 70 samples (from diarizers-community/voxconverse dev)
    - 65 files used for training
    - 5 files used for development/validation
  - Test split: 5 samples (from diarizers-community/voxconverse test)

Saves audio files in 16kHz mono WAV format and outputs .rttm annotations, 
.uem evaluation maps, and list files (.lst) under the structured paths.

Requirements:
    pip install datasets soundfile librosa tqdm argparse
"""

import os
import argparse
import numpy as np
import soundfile as sf

def setup_args():
    parser = argparse.ArgumentParser(description="Prepare and partition VoxConverse dataset into 3 parts.")
    parser.add_argument(
        "--output_dir", 
        type=str, 
        default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "Diarization"),
        help="Target folder to save partitioned diarization datasets"
    )
    parser.add_argument(
        "--token", 
        type=str, 
        default=None,
        help="Hugging Face API token (VoxConverse requires HF authentication)"
    )
    parser.add_argument(
        "--dry_run",
        action="store_true",
        help="If set, downloads only a tiny mock slice (7 train/val, 2 test) to verify the pipeline quickly."
    )
    return parser.parse_args()

def preprocess_audio(audio_array, orig_sr, target_sr=16000):
    """Convert to mono and resample to 16kHz."""
    if len(audio_array.shape) > 1:
        if audio_array.shape[0] < audio_array.shape[1]:
            audio_array = np.mean(audio_array, axis=0)
        else:
            audio_array = np.mean(audio_array, axis=1)
    if orig_sr != target_sr:
        import librosa
        audio_array = librosa.resample(audio_array, orig_sr=orig_sr, target_sr=target_sr)
    return audio_array, target_sr

def make_rttm(uri, starts, ends, speakers):
    """Generates standard RTTM annotation rows."""
    lines = []
    for s, e, spk in zip(starts, ends, speakers):
        dur = round(float(e) - float(s), 3)
        if dur <= 0:
            continue
        lines.append(f"SPEAKER {uri} 1 {float(s):.3f} {dur:.3f} <NA> <NA> {spk} <NA> <NA>")
    return "\n".join(lines) + "\n" if lines else ""

def make_uem(uri, duration):
    """Generates standard UEM evaluation map rows."""
    return f"{uri} 1 0.000 {duration:.3f}\n"

def process_and_save_split(dataset, audio_dir, rttm_dir, uem_dir, split_name, target_size):
    """Downloads, resamples, saves audios, and extracts annotations."""
    from tqdm import tqdm
    uris = []
    iterator = iter(dataset)
    
    print(f"   Downloading & preparing '{split_name}' split ({target_size} samples)...")
    
    for i in tqdm(range(target_size)):
        try:
            sample = next(iterator)
        except StopIteration:
            print(f"   ⚠️ End of dataset reached early at sample {i}.")
            break
            
        uri = f"{split_name}_{i:03d}"
        uris.append(uri)

        # Save audio
        import io
        audio = sample["audio"]
        arr, sr = sf.read(io.BytesIO(audio["bytes"]))
        
        clean_arr, target_sr = preprocess_audio(arr, sr)
        wav_path = os.path.join(audio_dir, f"{uri}.wav")
        sf.write(wav_path, clean_arr, target_sr)

        duration = len(clean_arr) / target_sr

        # RTTM annotations
        rttm_content = make_rttm(
            uri,
            sample["timestamps_start"],
            sample["timestamps_end"],
            sample["speakers"]
        )
        with open(os.path.join(rttm_dir, f"{uri}.rttm"), "w") as f:
            f.write(rttm_content)

        # UEM maps
        with open(os.path.join(uem_dir, f"{uri}.uem"), "w") as f:
            f.write(make_uem(uri, duration))
            
    return uris

def write_lst(path, uris):
    """Writes list files containing audio URIs."""
    with open(path, "w") as f:
        f.write("\n".join(uris) + "\n")

def main():
    import sys
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        
    args = setup_args()
    
    print("=" * 60)
    print("      VOXCONVERSE (DIARIZATION) DATA CONVERTER & PARTITIONER")
    print("=" * 60)
    print(f"Output directory : {args.output_dir}")
    print(f"Dry run mode     : {args.dry_run}")
    
    # Lazy imports
    from datasets import load_dataset
    
    # Setup sizes
    train_size = 70 if not args.dry_run else 7
    test_size = 5 if not args.dry_run else 2
    
    total_parts = 3
    
    print("\n📥 Connecting to Hugging Face VoxConverse (Streaming Mode)...")
    import datasets
    ds_dev_stream = load_dataset("diarizers-community/voxconverse", split="dev", token=args.token, streaming=True).cast_column("audio", datasets.Audio(decode=False))
    ds_test_stream = load_dataset("diarizers-community/voxconverse", split="test", token=args.token, streaming=True).cast_column("audio", datasets.Audio(decode=False))
    
    for part in range(1, total_parts + 1):
        print(f"\n📦 Preparing [PART {part}/{total_parts}]...")
        part_dir = os.path.join(args.output_dir, f"part_{part}")
        
        # Folder layout as expected by pyannote training protocol config
        audio_train_dir = os.path.join(part_dir, "audio", "train")
        audio_test_dir = os.path.join(part_dir, "audio", "test")
        rttm_dir = os.path.join(part_dir, "rttm")
        uem_dir = os.path.join(part_dir, "uem")
        lst_dir = os.path.join(part_dir, "lst")
        
        for d in [audio_train_dir, audio_test_dir, rttm_dir, uem_dir, lst_dir]:
            os.makedirs(d, exist_ok=True)
            
        # Calculate skips
        skip_train = (part - 1) * train_size
        skip_test = (part - 1) * test_size
        
        # Take streams
        part_dev_stream = ds_dev_stream.skip(skip_train).take(train_size)
        part_test_stream = ds_test_stream.skip(skip_test).take(test_size)
        
        # Process datasets
        train_uris = process_and_save_split(
            part_dev_stream, audio_train_dir, rttm_dir, uem_dir, "train", train_size
        )
        test_uris = process_and_save_split(
            part_test_stream, audio_test_dir, rttm_dir, uem_dir, "test", test_size
        )
        
        # Partition training set into train and validation URIs
        val_count = 5 if not args.dry_run else 2
        dev_uris = train_uris[-val_count:]
        train_uri_list = train_uris[:-val_count]
        
        # Write lists
        write_lst(os.path.join(lst_dir, "train.lst"), train_uri_list)
        write_lst(os.path.join(lst_dir, "development.lst"), dev_uris)
        write_lst(os.path.join(lst_dir, "test.lst"), test_uris)
        
        print(f"   ✓ Wrote protocol list files under {lst_dir}:")
        print(f"     - train.lst       : {len(train_uri_list)} files")
        print(f"     - development.lst : {len(dev_uris)} files")
        print(f"     - test.lst        : {len(test_uris)} files")
        
    print("\n🎉 VoxConverse partitioning complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()
