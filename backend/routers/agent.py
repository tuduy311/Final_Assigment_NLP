import os
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from google import genai
from google.genai import types

router = APIRouter(
    prefix="/agent",
    tags=["Agentic AI Chat"]
)

WORKSPACE_BASE_DIR = os.getenv("WORKSPACE_BASE_DIR", "./audio-workspaces")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    audio_id: str
    message: str
    history: list[ChatMessage] = []

# --- Definitions of Tools ---

def get_transcript(audio_id: str) -> str:
    """Returns the full transcript text of the meeting."""
    path = os.path.join(WORKSPACE_BASE_DIR, audio_id, "transcript.json")
    if not os.path.exists(path):
        return "Transcript not available."
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("text", "Transcript not available.")
    except Exception as e:
        return f"Error reading transcript: {e}"

def get_action_items(audio_id: str) -> str:
    """Returns the list of action items/tasks extracted from the meeting in JSON format."""
    path = os.path.join(WORKSPACE_BASE_DIR, audio_id, "summary.json")
    if not os.path.exists(path):
        return "Action items not available."
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            items = data.get("action_items", [])
            return json.dumps(items, ensure_ascii=False)
    except Exception as e:
        return f"Error reading action items: {e}"

def get_summary(audio_id: str) -> str:
    """Returns the summary of the meeting."""
    path = os.path.join(WORKSPACE_BASE_DIR, audio_id, "summary.json")
    if not os.path.exists(path):
        return "Summary not available."
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("summary", "Summary not available.")
    except Exception as e:
        return f"Error reading summary: {e}"

def create_calendar_event(title: str, date: str) -> str:
    """Creates a calendar event. Use this tool when the user asks to add a task or deadline to their calendar.
    Args:
        title (str): The title of the event/task.
        date (str): The date in YYYY-MM-DD format.
    """
    return f"Successfully created calendar event '{title}' on {date}. (Mocked response)"

tool_functions = [get_transcript, get_action_items, get_summary, create_calendar_event]

@router.post("/chat")
async def agent_chat(request: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured.")

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        
        # Build history for the chat
        contents = []
        # Prepend system context
        system_prompt = (
            "You are an AI Meeting Assistant (Agent). You have access to tools to retrieve meeting data. "
            f"The current audio_id is '{request.audio_id}'. You MUST pass this audio_id to any tool that requires it. "
            "If the user asks a question, use the tools to find the answer. "
            "If the user asks to 'generate' the transcript, speakers, or summary, AND the tools say they are 'not available', "
            "you MUST politely tell the user: 'I cannot generate this directly from the chat. Please click the respective "
            "\"Generate\" or \"Detect\" button on the dashboard above to process the audio first.' "
            "If you need more information to use a tool (e.g. date for calendar), ask clarifying questions to the user."
        )
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=system_prompt)]))
        contents.append(types.Content(role="model", parts=[types.Part.from_text(text="Understood.")]))

        for msg in request.history:
            role = "user" if msg.role == "user" else "model"
            contents.append(types.Content(role=role, parts=[types.Part.from_text(text=msg.content)]))
            
        # Add the latest user message
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=request.message)]))

        # We will use raw generate_content with a manual while-loop to handle function calling
        # because the automatic function calling wrapper might vary by version.
        
        # Maximum 5 iterations to prevent infinite loops
        for i in range(5):
            response = client.models.generate_content(
                model='gemini-2.5-flash',
                contents=contents,
                config=types.GenerateContentConfig(
                    tools=tool_functions,
                    temperature=0.2
                )
            )
            
            # Add model response to contents
            if response.candidates and response.candidates[0].content:
                contents.append(response.candidates[0].content)
            else:
                break
                
            # Check if model wants to call a function
            function_calls = response.function_calls
            if not function_calls:
                # No function calls, the model provided a text response
                break
                
            # Execute function calls and add results to contents
            parts = []
            for function_call in function_calls:
                func_name = function_call.name
                func_args = function_call.args
                
                result = f"Error: Function {func_name} not found."
                
                # Manual dispatch
                if func_name == "get_transcript":
                    result = get_transcript(func_args.get("audio_id", ""))
                elif func_name == "get_action_items":
                    result = get_action_items(func_args.get("audio_id", ""))
                elif func_name == "get_summary":
                    result = get_summary(func_args.get("audio_id", ""))
                elif func_name == "create_calendar_event":
                    result = create_calendar_event(func_args.get("title", ""), func_args.get("date", ""))
                
                parts.append(types.Part.from_function_response(
                    name=func_name,
                    response={"result": result}
                ))
            
            contents.append(types.Content(role="user", parts=parts))

        # Final check for text
        final_text = "I could not generate a response."
        if response.text:
            final_text = response.text
            
        return {"reply": final_text}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
