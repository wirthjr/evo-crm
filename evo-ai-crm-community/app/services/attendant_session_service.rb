class AttendantSessionService
  def initialize(user:)
    @user = user
  end

  AVAILABILITY_MAP = { 0 => 'online', 1 => 'offline', 2 => 'busy' }.freeze

  def start_work
    ActiveRecord::Base.transaction do
      finish_existing_session!
      session = @user.attendant_sessions.create!(
        status: 'active',
        started_at: Time.current
      )
      @user.update_column(:availability, 0)
      update_redis_status!
      broadcast_status!
      session
    end
  end

  def stop_work
    ActiveRecord::Base.transaction do
      session = @user.attendant_sessions.active.first
      return nil unless session

      session.finish!
      @user.update_column(:availability, 1)
      update_redis_status!
      broadcast_status!
      session
    end
  end

  def active_session
    @user.attendant_sessions.active.first
  end

  def working?
    @user.attendant_sessions.active.exists?
  end

  def self.active_attendants
    User.where(
      id: AttendantSession.active.select(:user_id)
    )
  end

  def self.active_attendants_count
    AttendantSession.active.count
  end

  def self.active_attendants_summary
    active_users = active_attendants.select(:id, :name, :display_name, :email, :availability)
    active_users.map do |user|
      session = user.attendant_sessions.active.first
      {
        id: user.id,
        name: user.available_name,
        email: user.email,
        availability: AVAILABILITY_MAP[user.availability] || user.availability,
        started_at: session&.started_at,
        session_id: session&.id
      }
    end
  end

  private

  def finish_existing_session!
    @user.attendant_sessions.active.find_each(&:finish!)
  end

  def update_redis_status!
    ::OnlineStatusTracker.set_status(@user.id, AVAILABILITY_MAP[@user.availability] || 'offline')
  end

  def broadcast_status!
    Rails.configuration.dispatcher.dispatch(
      Events::Types::ACCOUNT_PRESENCE_UPDATED,
      Time.zone.now,
      user_id: @user.id,
      status: AVAILABILITY_MAP[@user.availability] || @user.availability
    )
  end
end
