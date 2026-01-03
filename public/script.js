class ProfileChat {
  constructor() {
    this.messages = document.getElementById('messages');
    this.messageInput = document.getElementById('messageInput');
    this.sendButton = document.getElementById('sendButton');
    this.typingIndicator = document.getElementById('typing');

    this.isLoading = false;
    this.init();
  }

  init() {
    // Set initial timestamp
    document.getElementById('initial-time').textContent = this.formatTime(
      new Date()
    );

    // Event listeners
    this.messageInput.addEventListener('input', () => this.handleInputChange());
    this.messageInput.addEventListener('keypress', (e) =>
      this.handleKeyPress(e)
    );
    this.sendButton.addEventListener('click', () => this.sendMessage());

    // Suggestion buttons
    document.querySelectorAll('.suggestion').forEach((button) => {
      button.addEventListener('click', (e) => {
        const message = e.target.getAttribute('data-message');
        this.sendQuickMessage(message);
      });
    });
  }

  formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  handleInputChange() {
    const hasText = this.messageInput.value.trim().length > 0;
    this.sendButton.disabled = !hasText || this.isLoading;
  }

  handleKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey && !this.isLoading) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  async sendMessage() {
    const message = this.messageInput.value.trim();
    if (!message || this.isLoading) return;

    this.addMessage(message, 'user');
    this.messageInput.value = '';
    this.handleInputChange();
    this.showTyping();

    try {
      const response = await this.callChatAPI(message);
      this.hideTyping();
      this.addMessage(response, 'assistant');
    } catch (error) {
      this.hideTyping();
      this.addMessage(
        'Sorry, I encountered an error. Please try again.',
        'assistant'
      );
      console.error('Chat error:', error);
    }
  }

  async sendQuickMessage(message) {
    if (this.isLoading) return;

    // Hide suggestions after first use
    const suggestions = document.querySelector('.suggestions');
    if (suggestions) {
      suggestions.style.display = 'none';
    }

    this.addMessage(message, 'user');
    this.showTyping();

    try {
      const response = await this.callChatAPI(message);
      this.hideTyping();
      this.addMessage(response, 'assistant');
    } catch (error) {
      this.hideTyping();
      this.addMessage(
        'Sorry, I encountered an error. Please try again.',
        'assistant'
      );
      console.error('Chat error:', error);
    }
  }

  async callChatAPI(message) {
    this.isLoading = true;
    this.handleInputChange();

    try {
      const response = await fetch('/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.reply;
    } finally {
      this.isLoading = false;
      this.handleInputChange();
    }
  }

  addMessage(content, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const timestamp = this.formatTime(new Date());

    messageDiv.innerHTML = `
      <div class="message-content">
        <p>${this.escapeHtml(content)}</p>
      </div>
      <div class="timestamp">${timestamp}</div>
    `;

    this.messages.appendChild(messageDiv);
    this.scrollToBottom();
  }

  showTyping() {
    this.typingIndicator.classList.add('show');
    this.scrollToBottom();
  }

  hideTyping() {
    this.typingIndicator.classList.remove('show');
  }

  scrollToBottom() {
    setTimeout(() => {
      this.messages.scrollTop = this.messages.scrollHeight;
    }, 100);
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize chat when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ProfileChat();
});
