# Data Preparation & Partitioning

This folder contains Python scripts to automatically download, preprocess, and partition datasets for the Speech-to-Text (ASR) and Speaker Diarization pipelines.

---

## 1. Requirements & Setup

To run these scripts, first install the required Python packages:
```bash
pip install -r data/requirements.txt
```
*(Dependencies: `datasets`, `soundfile`, `librosa`, `tqdm`)*

---

## 2. Speech-to-Text (ASR) Dataset Preparation

* **Script**: `data/prepare_librispeech.py`
* **Dataset**: [LibriSpeech ASR (openslr/librispeech_asr)](https://huggingface.co/datasets/openslr/librispeech_asr)
* **Strategy**: Partitions the dataset into **5 sequential parts** to simulate continual learning stages.
* **Format**: Saves audio as 16kHz mono `.wav` files and generates a `metadata.jsonl` file in each split mapping filenames to text transcriptions.
* **Per-Part Split Size**:
  * **Train**: 2,000 samples (from the `clean` train.100 split)
  * **Validation**: 200 samples (from the `clean` validation split)
  * **Test**: 200 samples (from the `other` test split)

### Execution Commands:

* **Dry Run (Quick Test)**: downloads only 2 samples per split to quickly verify directory creation:
  ```bash
  python data/prepare_librispeech.py --dry_run
  ```
* **Full Run**:
  ```bash
  python data/prepare_librispeech.py
  ```
  *(Default output location: `data/ASR/part_X/`)*

---

## 3. Speaker Diarization Dataset Preparation

* **Script**: `data/prepare_voxconverse.py`
* **Dataset**: [VoxConverse (diarizers-community/voxconverse)](https://huggingface.co/datasets/diarizers-community/voxconverse)
* **Strategy**: Partitions the dataset into **3 sequential parts**.
* **Format**: Resamples audio to 16kHz mono `.wav`, generates `.rttm` speaker turn annotations, `.uem` evaluation maps, and `.lst` list files for training protocols.
* **Per-Part Split Size**:
  * **Dev/Train**: 70 samples (split into 65 files for `train.lst` and 5 files for `development.lst`)
  * **Test**: 5 samples (mapped to `test.lst`)

### Execution Commands:

* **Dry Run (Quick Test)**: downloads a mini slice (7 train/val, 2 test samples) to verify formatting:
  ```bash
  python data/prepare_voxconverse.py --dry_run
  ```
* **Full Run**:
  ```bash
  python data/prepare_voxconverse.py --token YOUR_HF_TOKEN
  ```
  *(Note: VoxConverse requires a Hugging Face API token. Access must be granted on the Hugging Face dataset page. Default output location: `data/Diarization/part_X/`)*
