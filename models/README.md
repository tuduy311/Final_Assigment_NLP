# Models and Checkpoints Guide

This directory contains the Jupyter Notebooks used for training and evaluating our Speech-to-Text (ASR) and Speaker Diarization models.

> [!IMPORTANT]
> **Execution Environment:** All notebook files (`.ipynb` files inside `models/notebooks/`) are designed and optimized to run on **Google Colab** with a **T4 GPU** (or better) runtime.

## Checkpoint Links

Because model weight files are too large to be committed to Git, all trained checkpoints are hosted on Google Drive. You can access them through the following links:

* **ASR (Speech-to-Text) Checkpoints:** [Google Drive Folder](https://drive.google.com/drive/folders/1HMBLN7toj2Yf1XcQzrkC521LWZhSIcDl?usp=sharing)
  * Expected Google Drive Path: `/content/drive/MyDrive/Speech_to_Text_CL`
* **Speaker Diarization Checkpoints:** [Google Drive Folder](https://drive.google.com/drive/folders/1VwMIc2G1iHR7Z_LOf5nhyjEcpyh9k3Ex?usp=sharing)
  * Expected Google Drive Path: `/content/drive/MyDrive/VoxConverse_Continual_Learning`

---

## Folder Structure inside Google Drive

To run the evaluation and training notebooks successfully, please ensure your Google Drive directory structures match the following schemas:

### 1. Speech-to-Text (ASR)
After mounting your Google Drive on Google Colab, the ASR folder `/content/drive/MyDrive/Speech_to_Text_CL` should contain:
```
Speech_to_Text_CL/
├── checkpoint_part_1/
├── checkpoint_part_2/
├── checkpoint_part_3/
├── checkpoint_part_4/
└── checkpoint_part_5/
```

### 2. Speaker Diarization
The Diarization folder `/content/drive/MyDrive/VoxConverse_Continual_Learning` should contain:
```
VoxConverse_Continual_Learning/
├── checkpoints_part_1/
│   ├── best-model-epoch=30.ckpt
│   └── last.ckpt
├── checkpoints_part_2/
│   ├── best-model-epoch=45.ckpt
│   └── last.ckpt
└── checkpoints_part_3/
    ├── best-model-epoch=48.ckpt
    └── last.ckpt
```

---

## Local Development & Git Warning

Ensure that you do **not** stage or push the actual model weight files (e.g., `.safetensors`, `.ckpt`, `.bin` files) to Git, as they will exceed repository storage limits. 
If you have downloaded these folders locally into your project workspace for backup, verify they are excluded in your `.gitignore` or untracked before committing.
